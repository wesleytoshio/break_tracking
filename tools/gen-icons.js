// Gera assets/icon.ico (multi-tamanho) e assets/icon.png a partir de assets/icon.svg.
// Uso: node tools/gen-icons.js
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const _p2i = require('png-to-ico');
const pngToIco = typeof _p2i === 'function' ? _p2i : _p2i.default;

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'assets', 'icon.svg'));

function png(size) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size } }); // fundo transparente
  return Buffer.from(r.render().asPng());
}

(async () => {
  const sizes = [256, 128, 64, 48, 32, 16];
  const pngs = sizes.map(png);
  const ico = await pngToIco(pngs);
  fs.writeFileSync(path.join(root, 'assets', 'icon.ico'), ico);
  fs.writeFileSync(path.join(root, 'assets', 'icon.png'), png(256));
  console.log('OK — icon.ico:', ico.length, 'bytes | icon.png: 256px |', sizes.join('/'));
})().catch(e => { console.error('ERRO:', e && e.stack || e); process.exit(1); });
