/**
 * Script de teste — Cria profissional + usuário staff vinculado
 *
 * Uso: node test-prof2.js
 *
 * Seguro para re-executar: usa email único com timestamp e
 * verifica duplicidade antes de inserir.
 */

import { query } from './server/config/database.js';
import bcrypt from 'bcryptjs';

const BARBEARIA_ID = '611c3497-0857-4fa1-9b6d-b6f891440645';
const NOME = 'Barbeiro Teste 2';
const SENHA = '123456';

// Email único por execução — evita conflito em re-execuções
const ts = Date.now();
const EMAIL = `barbeiro.test2-${ts}@teste.com`;

const PERMISSOES = {
  clientes: true,
  comandas: true,
  gerenciar_agenda: false,
  relatorios: false,
  caixa: false,
  estoque: false,
  servicos: false,
  horarios: false,
  configuracoes: false,
  cancelar_agendamento: false,
};

async function main() {
  console.log('🧪 Criando profissional + usuário staff...\n');
  console.log(`   Nome:  ${NOME}`);
  console.log(`   Email: ${EMAIL}`);
  console.log('');

  // ── Verifica se email já existe ──
  const emailCheck = await query('SELECT id FROM usuarios WHERE email = $1', [EMAIL]);
  if (emailCheck.rowCount > 0) {
    console.log('⚠️  Email já existe no banco. Abortando.');
    console.log(`   Usuário existente: ${emailCheck.rows[0].id}`);
    process.exit(0);
  }

  // ── Cria profissional + usuário em transação ──
  const pool = (await import('./server/config/database.js')).default;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Insere profissional
    const profResult = await client.query(
      `INSERT INTO profissionais (
         barbearia_id, nome, especialidade, telefone,
         notificar_whatsapp, avatar_inicial, ordem,
         eh_responsavel, comissao_servico_percentual,
         comissao_produto_percentual, data_contratacao, permissoes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
       RETURNING *`,
      [
        BARBEARIA_ID, NOME, null, '11988887777',
        true, NOME.charAt(0).toUpperCase(), 0,
        false, 50, 10, null, JSON.stringify(PERMISSOES),
      ]
    );
    const profissional = profResult.rows[0];
    console.log(`✅ Profissional criado: ${profissional.id}`);
    console.log(`   Nome: ${profissional.nome}`);
    console.log(`   Permissões: ${JSON.stringify(profissional.permissoes)}`);

    // 2. Insere usuário vinculado
    const senhaHash = bcrypt.hashSync(SENHA, 10);
    const userResult = await client.query(
      `INSERT INTO usuarios (barbearia_id, nome, email, senha_hash, role, profissional_id)
       VALUES ($1,$2,$3,$4,'staff',$5)
       RETURNING id, nome, email, role, profissional_id, created_at`,
      [BARBEARIA_ID, NOME, EMAIL, senhaHash, profissional.id]
    );
    const usuario = userResult.rows[0];
    console.log(`✅ Usuário criado: ${usuario.id}`);
    console.log(`   Email: ${usuario.email}`);
    console.log(`   Role: ${usuario.role}`);
    console.log(`   Vinculado ao profissional: ${usuario.profissional_id}`);

    await client.query('COMMIT');

    console.log('\n🎉 Profissional e usuário criados com sucesso!');
    console.log(`   Login: ${EMAIL}`);
    console.log(`   Senha: ${SENHA}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro — transação revertida (ROLLBACK):', err.message);
    console.error('   Nenhum dado foi persistido.');
    process.exit(1);
  } finally {
    client.release();
  }

  process.exit(0);
}

main();
