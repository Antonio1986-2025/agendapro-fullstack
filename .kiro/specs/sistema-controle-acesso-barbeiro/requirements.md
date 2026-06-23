# Requirements Document

## Introduction

O Sistema de Controle de Acesso e Permissões para Barbeiros implementa um modelo de permissões baseado em roles (RBAC) para o AgendaPro SaaS. Este sistema garante que barbeiros comuns (role: staff) tenham acesso restrito apenas às funcionalidades necessárias para seu trabalho diário, enquanto administradores e proprietários mantêm controle total do sistema. O objetivo é eliminar ações indevidas (como barbeiros concluindo agendamentos manualmente), proteger dados sensíveis (relatórios financeiros, comandas), e automatizar o fluxo de trabalho entre agendamento, atendimento, fechamento de comanda e creditação de comissões.

## Glossary

- **Sistema**: O sistema AgendaPro completo (frontend + backend)
- **Backend_Auth**: Middleware de autenticação e autorização no servidor Node.js/Express
- **Frontend**: Interface do usuário (HTML/JavaScript)
- **Barbeiro_Comum**: Usuário com role "staff" vinculado a um profissional_id
- **ADM**: Usuário com role "owner" ou "admin"
- **Caixa**: Usuário com role "staff" e permissão especial "comandas: true"
- **Agendamento**: Registro na tabela agendamentos representando um horário reservado
- **Comanda**: Registro na tabela comandas representando uma conta aberta para pagamento
- **Bloqueio**: Agendamento especial sem cliente_id usado para marcar horários indisponíveis
- **Parser**: Componente que interpreta permissões JSONB do banco de dados
- **Pretty_Printer**: Componente que formata permissões para exibição/armazenamento
- **Validator**: Componente que verifica se uma ação é permitida para um usuário
- **Middleware_Permissoes**: Middleware Express que valida permissões antes de executar ações

## Requirements

### Requirement 1: Autenticação e Carregamento de Permissões

**User Story:** Como desenvolvedor do sistema, eu quero que permissões sejam carregadas no momento do login e validadas no backend, para que o controle de acesso seja seguro e consistente.

#### Acceptance Criteria

1. WHEN um usuário faz login, THE Backend_Auth SHALL carregar permissões do banco de dados (campo profissionais.permissoes JSONB)
2. THE Parser SHALL interpretar o campo profissionais.permissoes JSONB e converter para objeto JavaScript
3. FOR ALL válidas permissões JSONB, parsing então pretty-printing então parsing SHALL produzir um objeto equivalente (round-trip property)
4. WHEN permissões são carregadas, THE Backend_Auth SHALL incluir permissões no token JWT ou session
5. IF o campo profissionais.permissoes é NULL, THEN THE Backend_Auth SHALL aplicar permissões padrão de barbeiro comum: `{"clientes":true,"comandas":false,"gerenciar_agenda":false,"relatorios":false}`

### Requirement 2: Validação de Permissões no Backend

**User Story:** Como administrador do sistema, eu quero que todas as ações sejam validadas no backend, para que usuários não possam burlar restrições modificando o frontend.

#### Acceptance Criteria

1. WHEN uma requisição HTTP chega em endpoints protegidos, THE Middleware_Permissoes SHALL validar permissões antes de executar a ação
2. IF um Barbeiro_Comum tenta acessar endpoint de comandas sem permissão "comandas: true", THEN THE Backend_Auth SHALL retornar HTTP 403 Forbidden
3. IF um Barbeiro_Comum tenta acessar endpoint de relatórios sem permissão "relatorios: true", THEN THE Backend_Auth SHALL retornar HTTP 403 Forbidden
4. WHEN um Barbeiro_Comum acessa endpoint de agendamentos, THE Backend_Auth SHALL filtrar resultados por profissional_id vinculado
5. THE Validator SHALL garantir que cada requisição seja validada exatamente uma vez (idempotência de validação)

### Requirement 3: Filtragem de Agenda por Profissional

**User Story:** Como barbeiro comum, eu quero ver apenas minha própria agenda, para que eu foque apenas nos meus compromissos sem visualizar dados de outros profissionais.

#### Acceptance Criteria

1. WHEN um Barbeiro_Comum acessa GET /api/agendamentos, THE Backend_Auth SHALL aplicar filtro WHERE profissional_id = usuario.profissional_id
2. THE Backend_Auth SHALL retornar apenas agendamentos vinculados ao profissional_id do usuário logado
3. IF usuario.profissional_id é NULL, THEN THE Sistema SHALL retornar lista vazia de agendamentos
4. WHEN um ADM acessa GET /api/agendamentos, THE Backend_Auth SHALL retornar todos os agendamentos da barbearia sem filtro
5. FOR ALL agendamentos retornados, cliente_id e profissional_id SHALL pertencer à mesma barbearia_id do usuário logado

### Requirement 4: Restrição de Ações em Agendamentos

**User Story:** Como administrador do sistema, eu quero que barbeiros comuns não possam concluir agendamentos manualmente, para que o fluxo correto (fechamento de comanda) seja seguido.

#### Acceptance Criteria

1. WHEN um Barbeiro_Comum tenta PATCH /api/agendamentos/:id/status com status "concluido", THEN THE Backend_Auth SHALL retornar HTTP 403 Forbidden
2. WHEN um Barbeiro_Comum tenta PATCH /api/agendamentos/:id/status com status "confirmado" ou "cancelado", THE Backend_Auth SHALL permitir a ação
3. WHEN um ADM ou Caixa fecha uma comanda, THE Sistema SHALL automaticamente atualizar agendamento.status para "concluido"
4. THE Frontend SHALL ocultar botão "Concluir" para Barbeiro_Comum
5. IF um Barbeiro_Comum tenta criar agendamento para outro profissional, THEN THE Backend_Auth SHALL retornar HTTP 403 Forbidden

### Requirement 5: Automação do Fluxo de Comanda e Agendamento

**User Story:** Como barbeiro, eu quero que minhas comissões sejam creditadas automaticamente quando o caixa fecha a comanda, para que eu não precise concluir agendamentos manualmente.

#### Acceptance Criteria

1. WHEN uma comanda é criada automaticamente após agendamento confirmado, THE Sistema SHALL definir comanda.status como "aberta"
2. WHEN ADM ou Caixa executa PATCH /api/comandas/:id/finalizar, THE Sistema SHALL executar as seguintes ações em transação:
   - Atualizar comanda.status para "finalizada"
   - Atualizar agendamento.status para "concluido"
   - Criar registros em tabela comissoes com status "pendente"
3. IF qualquer etapa da transação falhar, THEN THE Sistema SHALL reverter todas as alterações (rollback)
4. THE Sistema SHALL calcular valor_comissao baseado em profissionais.comissao_servico_percentual
5. WHEN comissão é criada, THE Sistema SHALL registrar profissional_id, comanda_id, tipo, descricao, valor_item, percentual e valor_comissao

### Requirement 6: Funcionalidade de Bloqueio de Horários

**User Story:** Como barbeiro, eu quero bloquear horários na minha agenda para compromissos pessoais, para que clientes não possam agendar nesses períodos.

#### Acceptance Criteria

1. WHEN um Barbeiro_Comum cria um bloqueio de horário, THE Sistema SHALL criar um agendamento com cliente_id NULL e tipo_bloqueio NOT NULL
2. THE Sistema SHALL aceitar valores de tipo_bloqueio: "intervalo", "compromisso", "folga"
3. WHEN um Barbeiro_Comum cria bloqueio, THE Backend_Auth SHALL validar que profissional_id do bloqueio corresponde ao profissional_id do usuário logado
4. IF um Barbeiro_Comum tenta criar bloqueio para outro profissional, THEN THE Backend_Auth SHALL retornar HTTP 403 Forbidden
5. WHEN cliente ou agente IA consulta horários disponíveis, THE Sistema SHALL excluir horários bloqueados da lista de slots disponíveis
6. THE Frontend SHALL exibir bloqueios visualmente distintos de agendamentos normais (exemplo: cor diferente, ícone específico)

### Requirement 7: Controle de Acesso a Comandas

**User Story:** Como administrador, eu quero que apenas usuários com permissão "comandas: true" possam acessar e gerenciar comandas, para proteger dados financeiros sensíveis.

#### Acceptance Criteria

1. WHEN um usuário acessa GET /api/comandas, THE Backend_Auth SHALL verificar permissão "comandas: true"
2. IF permissão "comandas: false", THEN THE Backend_Auth SHALL retornar HTTP 403 Forbidden
3. WHEN um Barbeiro_Comum tenta PATCH /api/comandas/:id/finalizar, THE Backend_Auth SHALL retornar HTTP 403 Forbidden
4. THE Frontend SHALL ocultar links de navegação para seção "Comandas" para usuários sem permissão
5. WHEN ADM ou Caixa acessa comandas, THE Backend_Auth SHALL aplicar filtro WHERE barbearia_id = usuario.barbearia_id

### Requirement 8: Controle de Acesso a Relatórios Financeiros

**User Story:** Como administrador, eu quero que barbeiros comuns não vejam relatórios financeiros completos, para proteger informações estratégicas da barbearia.

#### Acceptance Criteria

1. WHEN um usuário acessa GET /api/relatorios, THE Backend_Auth SHALL verificar permissão "relatorios: true"
2. IF permissão "relatorios: false", THEN THE Backend_Auth SHALL retornar HTTP 403 Forbidden
3. WHEN um Barbeiro_Comum acessa GET /api/comissoes/saldo, THE Backend_Auth SHALL retornar apenas comissões do próprio profissional
4. THE Frontend SHALL ocultar links de navegação para seção "Relatórios" para usuários sem permissão
5. WHEN um ADM acessa relatórios, THE Backend_Auth SHALL retornar dados de todos os profissionais da barbearia

### Requirement 9: Visualização Personalizada de Comissões

**User Story:** Como barbeiro, eu quero ver minhas comissões pendentes e pagas, para que eu acompanhe meus ganhos sem acessar dados de outros barbeiros.

#### Acceptance Criteria

1. WHEN um Barbeiro_Comum acessa GET /api/comissoes, THE Backend_Auth SHALL aplicar filtro WHERE profissional_id = usuario.profissional_id
2. THE Sistema SHALL retornar lista de comissões contendo: descricao, tipo, valor_item, percentual, valor_comissao, status, created_at
3. WHEN um Barbeiro_Comum acessa GET /api/comissoes/saldo, THE Backend_Auth SHALL calcular saldo pendente e pago apenas do próprio profissional
4. THE Frontend SHALL exibir aba "Comissões" na tela barbeiro.html com filtros: todas, pendentes, recebidas
5. WHEN um ADM acessa GET /api/comissoes, THE Backend_Auth SHALL retornar comissões de todos os profissionais da barbearia

### Requirement 10: Configurações Restritas para Barbeiro

**User Story:** Como barbeiro, eu quero acessar apenas minhas configurações pessoais (senha, tema, notificações), sem poder editar dados da barbearia ou horários de funcionamento.

#### Acceptance Criteria

1. WHEN um Barbeiro_Comum acessa configurações, THE Frontend SHALL exibir apenas: alterar senha, tema (claro/escuro), telefone pessoal, notificações WhatsApp
2. THE Frontend SHALL ocultar seções: horários de funcionamento, dados da barbearia, plano de assinatura, configuração de serviços
3. WHEN um Barbeiro_Comum tenta PATCH /api/barbearias/:id, THE Backend_Auth SHALL retornar HTTP 403 Forbidden
4. WHEN um Barbeiro_Comum executa PATCH /api/usuarios/me, THE Backend_Auth SHALL permitir atualização apenas de: senha_hash, telefone (se vinculado a profissional)
5. IF tentativa de atualizar campos não permitidos (role, barbearia_id, profissional_id), THEN THE Backend_Auth SHALL retornar HTTP 403 Forbidden

### Requirement 11: Navegação Baseada em Permissões

**User Story:** Como usuário do sistema, eu quero ver apenas os links de navegação que tenho permissão para acessar, para evitar confusão e tentativas de acesso negado.

#### Acceptance Criteria

1. WHEN o Frontend carrega a sidebar desktop, THE Frontend SHALL renderizar links baseado em permissões do usuário
2. WHEN um Barbeiro_Comum visualiza navegação, THE Frontend SHALL exibir apenas: "Minha Agenda", "Clientes", "Configurações"
3. WHEN um ADM visualiza navegação, THE Frontend SHALL exibir todos os links: Dashboard, Agenda, Clientes, Comandas, Relatórios, Equipe, Estoque, Financeiro, Configurações
4. THE Frontend SHALL aplicar classe "active" apenas ao link da página atual
5. WHEN navegação inferior (mobile) é renderizada, THE Frontend SHALL aplicar mesmas regras de filtragem de links

### Requirement 12: Gerenciamento de Clientes (Acesso Compartilhado)

**User Story:** Como barbeiro, eu quero visualizar e adicionar clientes da barbearia, para que eu possa criar agendamentos e consultar histórico de atendimentos.

#### Acceptance Criteria

1. WHEN um Barbeiro_Comum acessa GET /api/clientes, THE Backend_Auth SHALL retornar todos os clientes da barbearia (sem filtro por profissional)
2. WHEN um Barbeiro_Comum executa POST /api/clientes, THE Backend_Auth SHALL permitir criação de novo cliente
3. WHEN um Barbeiro_Comum executa PATCH /api/clientes/:id, THE Backend_Auth SHALL permitir edição de dados do cliente
4. THE Backend_Auth SHALL validar que cliente.barbearia_id corresponde ao barbearia_id do usuário logado
5. THE Frontend SHALL exibir link "Clientes" na navegação para Barbeiro_Comum

### Requirement 13: Auditoria de Tentativas de Acesso Não Autorizado

**User Story:** Como administrador do sistema, eu quero registrar tentativas de acesso não autorizado, para identificar possíveis vulnerabilidades ou uso indevido.

#### Acceptance Criteria

1. WHEN THE Backend_Auth retorna HTTP 403 Forbidden, THE Sistema SHALL registrar log contendo: usuario_id, barbearia_id, endpoint, método HTTP, timestamp
2. THE Sistema SHALL incluir no log: role do usuário, permissões atuais, profissional_id (se aplicável)
3. THE Sistema SHALL usar nível de log "WARN" para tentativas de acesso negado
4. IF múltiplas tentativas do mesmo usuário em curto período (>5 em 1 minuto), THEN THE Sistema SHALL elevar log para nível "ERROR"
5. THE Sistema SHALL formatar logs em JSON estruturado para facilitar análise

### Requirement 14: Migração de Dados e Retrocompatibilidade

**User Story:** Como desenvolvedor do sistema, eu quero que o sistema funcione com bancos de dados existentes que não possuem coluna tipo_bloqueio, para garantir migração suave.

#### Acceptance Criteria

1. WHEN o sistema detecta que coluna agendamentos.tipo_bloqueio não existe, THE Sistema SHALL executar ALTER TABLE ADD COLUMN IF NOT EXISTS tipo_bloqueio VARCHAR(30)
2. WHEN o sistema detecta que coluna usuarios.profissional_id não existe, THE Sistema SHALL executar ALTER TABLE ADD COLUMN IF NOT EXISTS profissional_id UUID REFERENCES profissionais(id)
3. WHEN o sistema detecta que coluna profissionais.permissoes não existe, THE Sistema SHALL executar ALTER TABLE com valor default '{"clientes":true,"comandas":true,"gerenciar_agenda":false,"relatorios":false}'
4. THE Sistema SHALL executar migrações de forma idempotente (múltiplas execuções não causam erro)
5. WHEN migrações são executadas, THE Sistema SHALL registrar log de sucesso ou falha para cada alteração

### Requirement 15: Testes de Permissões (Property-Based Testing)

**User Story:** Como desenvolvedor do sistema, eu quero validar que o sistema de permissões funciona corretamente para todas as combinações possíveis de roles e permissões.

#### Acceptance Criteria

1. FOR ALL combinações válidas de (role, permissoes), validação de acesso então tentativa de acesso SHALL produzir resultado consistente (idempotência de validação)
2. FOR ALL endpoints protegidos, tentativa de acesso sem permissão SHALL retornar HTTP 403 Forbidden
3. FOR ALL usuários com permissão válida, len(recursos_acessíveis) >= len(recursos_esperados) (metamorphic property)
4. FOR ALL agendamentos retornados para Barbeiro_Comum, agendamento.profissional_id = usuario.profissional_id (invariant)
5. FOR ALL tentativas de acesso, resultado de validação com permissões vazias {} = acesso negado (base case)
