// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const { CPU, assemble } = require('./cpu.js');
const EXAMPLES = require('./examples.js');

function run(src) {
  const { bytes } = assemble(src);
  const cpu = new CPU();
  cpu.reset(bytes);
  cpu.run();
  assert.ok(cpu.halted, 'program should halt');
  assert.strictEqual(cpu.error, null);
  return cpu;
}

test('count down prints 9..0', () => {
  assert.deepStrictEqual(run(EXAMPLES['Count down']).output, [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
});

test('fibonacci stops before overflow', () => {
  assert.deepStrictEqual(run(EXAMPLES['Fibonacci']).output, [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233]);
});

test('multiply subroutine', () => {
  assert.deepStrictEqual(run(EXAMPLES['Multiply (subroutine)']).output, [143]);
});

test('sum an array', () => {
  assert.deepStrictEqual(run(EXAMPLES['Sum an array']).output, [189]);
});

test('powers of two', () => {
  assert.deepStrictEqual(run(EXAMPLES['Powers of two']).output, [1, 2, 4, 8, 16, 32, 64, 128]);
});

test('labels resolve forward and backward', () => {
  const { labels, bytes } = assemble('start: JMP end\nNOP\nend: JMP start');
  assert.strictEqual(labels.start, 0);
  assert.strictEqual(labels.end, 3);
  assert.strictEqual(bytes[1], 3);
  assert.strictEqual(bytes[5], 0);
});

test('assembler reports the line of an error', () => {
  assert.throws(() => assemble('NOP\nFOO #1'), /Line 2: unknown instruction/);
  assert.throws(() => assemble('JMP nowhere'), /undefined label/);
  assert.throws(() => assemble('INC #1'), /does not take/);
});

test('carry and zero flags on ADD', () => {
  const cpu = run('LDA #200\nLDB #56\nADD\nHLT');
  assert.strictEqual(cpu.A, 0);
  assert.ok(cpu.Z);
  assert.ok(cpu.C);
});

test('CALL and RET use the stack', () => {
  const cpu = run('CALL f\nHLT\nf: LDA #7\nRET');
  assert.strictEqual(cpu.A, 7);
  assert.strictEqual(cpu.SP, 0xff);
});
