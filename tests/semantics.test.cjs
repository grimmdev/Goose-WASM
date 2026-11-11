const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { buildProject } = require('../service/build-project.js');

const probes = [
  { id: 'T01', name: 'integer division', src: 'import std;\nfn main() { let x: i64 = 7; let y: i64 = 2; print(x / y); }\n', expected: '3' },
  { id: 'T02', name: 'array copy', src: 'import std;\nfn main() { let a: i64[2] = [1, 2]; var b: i64[2] = a; b[0] = 9; print(a[0]); }\n', expected: '1' },
  { id: 'T03', name: 'defer', src: 'import std;\nfn cleanup() { print("cleanup"); }\nfn main() { defer cleanup(); print("body"); }\n', expected: 'body\ncleanup' },
  { id: 'T04', name: 'default parameter', src: 'import std;\nfn answer(x: i64 = 7) -> i64 { return x; }\nfn main() { print(answer()); }\n', expected: '7' },
];

async function runSemanticsTests() {
  console.log('=== Running Native Semantic Parity Probes ===');
  for (const p of probes) {
    const outDir = path.resolve(__dirname, '../build/probe-' + p.id);
    const buildRes = await buildProject({ source: p.src, outDir });
    assert.strictEqual(buildRes.success, true, 'Build must succeed for ' + p.id);

    const wasmBytes = fs.readFileSync(buildRes.gameWasm);
    const createGame = require(buildRes.gameMjs).default;

    let output = [];
    const m = await createGame({
      noInitialRun: true,
      instantiateWasm(info, receiveInstance) {
        WebAssembly.instantiate(wasmBytes, info).then(r => receiveInstance(r.instance));
        return {};
      },
      print: (t) => output.push(t),
    });

    m._goose_web_run(0, 0);
    const actual = output.join('\n');
    console.log(`✓ ${p.name} (${p.id}): expected='${p.expected.replace(/\n/g, "\\n")}', observed='${actual.replace(/\n/g, "\\n")}'`);
    assert.strictEqual(actual, p.expected, `${p.id} must match expected output`);
  }
  console.log('✓ All Semantic Probes Passed with 100% Native Parity!\n');
}

if (require.main === module) {
  runSemanticsTests().catch(err => {
    console.error('Semantic test error:', err);
    process.exit(1);
  });
}

module.exports = { runSemanticsTests };

