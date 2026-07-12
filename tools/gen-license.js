// FERRAMENTA DO FORNECEDOR — gera uma licença assinada para um cliente.
// A chave privada (license-private.pem) NUNCA vai para o app nem para o git.
//
// Uso:
//   node tools/gen-license.js "Nome do Cliente" <MachineId> [diasValidade]
//
// O <MachineId> é o "ID desta máquina" que o cliente vê na tela de Licença
// do app e envia para você. Sem diasValidade a licença é perpétua.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [, , name, machineId, days] = process.argv;
if (!name || !machineId) {
  console.error('Uso: node tools/gen-license.js "Nome do Cliente" <MachineId> [diasValidade]');
  process.exit(1);
}

const priv = crypto.createPrivateKey(fs.readFileSync(path.join(__dirname, 'license-private.pem')));
const payload = { name, machineId: String(machineId).toLowerCase(), edition: 'pro', issued: Date.now() };
if (days) payload.exp = Date.now() + Number(days) * 86400000;

const pB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
const sig = crypto.sign(null, Buffer.from(pB64), priv).toString('base64url');
const license = pB64 + '.' + sig;

console.log('\n=== LICENÇA (envie este código ao cliente) ===\n');
console.log(license);
console.log('\npayload:', JSON.stringify(payload));
if (payload.exp) console.log('expira em:', new Date(payload.exp).toLocaleString('pt-BR'));
