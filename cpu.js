// cpu8-sim core: an 8-bit CPU and a two-pass assembler.
// Works in the browser (window.CPU8) and in Node (module.exports).

(function (root) {
  'use strict';

  // ---------------------------------------------------------------
  // Instruction set
  // Each entry: mnemonic, addressing mode, opcode, cycle cost.
  // Modes: none, imm (#value), addr (memory address), ind ([B]).
  // ---------------------------------------------------------------
  const ISA = [
    ['HLT', 'none', 0x00], ['NOP', 'none', 0x01],
    ['LDA', 'imm', 0x02], ['LDA', 'addr', 0x03], ['LDA', 'ind', 0x04],
    ['STA', 'addr', 0x05], ['STA', 'ind', 0x06],
    ['LDB', 'imm', 0x07], ['LDB', 'addr', 0x08], ['STB', 'addr', 0x09],
    ['ADD', 'none', 0x10], ['ADD', 'imm', 0x11],
    ['SUB', 'none', 0x12], ['SUB', 'imm', 0x13],
    ['AND', 'none', 0x14], ['OR', 'none', 0x15], ['XOR', 'none', 0x16],
    ['INC', 'none', 0x17], ['DEC', 'none', 0x18],
    ['INB', 'none', 0x19], ['DEB', 'none', 0x1A],
    ['SHL', 'none', 0x1B], ['SHR', 'none', 0x1C],
    ['CMP', 'none', 0x1D], ['CMP', 'imm', 0x1E],
    ['TAB', 'none', 0x1F], ['TBA', 'none', 0x20],
    ['JMP', 'addr', 0x30], ['JZ', 'addr', 0x31], ['JNZ', 'addr', 0x32],
    ['JC', 'addr', 0x33], ['JNC', 'addr', 0x34], ['JN', 'addr', 0x35],
    ['PUSH', 'none', 0x40], ['POP', 'none', 0x41],
    ['CALL', 'addr', 0x42], ['RET', 'none', 0x43],
    ['OUT', 'none', 0x50],
  ];

  const BY_KEY = new Map();   // "LDA imm" -> opcode
  const BY_OPCODE = new Map(); // opcode -> { mnemonic, mode }
  for (const [m, mode, op] of ISA) {
    BY_KEY.set(m + ' ' + mode, op);
    BY_OPCODE.set(op, { mnemonic: m, mode });
  }
  const MNEMONICS = new Set(ISA.map((r) => r[0]));
  const sizeOf = (mode) => (mode === 'imm' || mode === 'addr' ? 2 : 1);

  // ---------------------------------------------------------------
  // Assembler
  // ---------------------------------------------------------------
  class AsmError extends Error {
    constructor(line, msg) {
      super('Line ' + line + ': ' + msg);
      this.line = line;
    }
  }

  function parseNumber(tok) {
    if (/^0x[0-9a-f]+$/i.test(tok)) return parseInt(tok, 16);
    if (/^0b[01]+$/i.test(tok)) return parseInt(tok.slice(2), 2);
    if (/^-?\d+$/.test(tok)) return parseInt(tok, 10);
    if (/^'.'$/.test(tok)) return tok.charCodeAt(1);
    return null;
  }

  // Turn an operand string into { mode, value | label }.
  function parseOperand(text, lineNo) {
    const t = text.trim();
    if (t === '') return { mode: 'none' };
    if (/^\[\s*b\s*\]$/i.test(t)) return { mode: 'ind' };
    const imm = t.startsWith('#');
    const body = imm ? t.slice(1).trim() : t;
    const n = parseNumber(body);
    const mode = imm ? 'imm' : 'addr';
    if (n !== null) {
      if (n < -128 || n > 255) throw new AsmError(lineNo, 'value out of 8-bit range: ' + body);
      return { mode, value: n & 0xff };
    }
    if (/^[a-z_][\w]*$/i.test(body)) return { mode, label: body };
    throw new AsmError(lineNo, 'cannot read operand "' + t + '"');
  }

  // Pass 1 finds every label's address. Pass 2 writes bytes.
  function assemble(source) {
    const lines = source.split(/\r?\n/);
    const items = []; // { lineNo, addr, kind, ... }
    const labels = Object.create(null);
    let addr = 0;

    // ---- pass 1 ----
    lines.forEach((raw, i) => {
      const lineNo = i + 1;
      let line = raw.replace(/;.*$/, '').trim();
      if (!line) return;

      const labelMatch = line.match(/^([a-z_][\w]*):\s*(.*)$/i);
      if (labelMatch) {
        const name = labelMatch[1];
        if (name in labels) throw new AsmError(lineNo, 'label "' + name + '" defined twice');
        labels[name] = addr;
        line = labelMatch[2].trim();
        if (!line) return;
      }

      const [head, ...rest] = line.split(/\s+/);
      const word = head.toUpperCase();
      const operandText = rest.join(' ');

      if (word === '.ORG') {
        const n = parseNumber(operandText.trim());
        if (n === null || n < 0 || n > 255) throw new AsmError(lineNo, '.org needs an address 0-255');
        addr = n;
        return;
      }
      if (word === '.DB') {
        const values = operandText.split(',').map((s) => s.trim()).filter(Boolean);
        if (!values.length) throw new AsmError(lineNo, '.db needs at least one value');
        items.push({ lineNo, addr, kind: 'data', values });
        addr += values.length;
        return;
      }
      if (!MNEMONICS.has(word)) throw new AsmError(lineNo, 'unknown instruction "' + head + '"');
      const operand = parseOperand(operandText, lineNo);
      if (!BY_KEY.has(word + ' ' + operand.mode)) {
        throw new AsmError(lineNo, word + ' does not take a ' + modeName(operand.mode) + ' operand');
      }
      items.push({ lineNo, addr, kind: 'op', mnemonic: word, operand });
      addr += sizeOf(operand.mode);
      if (addr > 256) throw new AsmError(lineNo, 'program is larger than 256 bytes');
    });

    // ---- pass 2 ----
    const bytes = new Uint8Array(256);
    const sourceMap = new Map(); // address -> line number
    const resolve = (tok, lineNo) => {
      if (typeof tok === 'number') return tok;
      if (!(tok in labels)) throw new AsmError(lineNo, 'undefined label "' + tok + '"');
      return labels[tok];
    };

    for (const it of items) {
      if (it.kind === 'data') {
        it.values.forEach((v, k) => {
          const n = parseNumber(v);
          const value = n !== null ? n : resolve(v, it.lineNo);
          if (value < -128 || value > 255) throw new AsmError(it.lineNo, 'value out of range: ' + v);
          bytes[it.addr + k] = value & 0xff;
          sourceMap.set(it.addr + k, it.lineNo);
        });
        continue;
      }
      const { mnemonic, operand } = it;
      bytes[it.addr] = BY_KEY.get(mnemonic + ' ' + operand.mode);
      sourceMap.set(it.addr, it.lineNo);
      if (sizeOf(operand.mode) === 2) {
        const v = 'label' in operand ? resolve(operand.label, it.lineNo) : operand.value;
        bytes[it.addr + 1] = v & 0xff;
      }
    }

    const size = items.reduce((m, it) => Math.max(m, it.addr + (it.kind === 'data' ? it.values.length : sizeOf(it.operand.mode))), 0);
    return { bytes, labels, sourceMap, size };
  }

  function modeName(mode) {
    return { none: 'no', imm: 'immediate (#)', addr: 'address', ind: 'indirect [B]' }[mode];
  }

  // ---------------------------------------------------------------
  // CPU
  // Registers: A, B (8-bit), PC, SP (8-bit), flags Z, C, N.
  // Stack grows down from 0xFF.
  // ---------------------------------------------------------------
  class CPU {
    constructor() { this.reset(); }

    reset(program) {
      this.mem = new Uint8Array(256);
      if (program) this.mem.set(program);
      this.A = 0; this.B = 0; this.PC = 0; this.SP = 0xff;
      this.Z = false; this.C = false; this.N = false;
      this.halted = false;
      this.cycles = 0;
      this.output = [];
      this.lastWrite = -1;
      this.error = null;
    }

    setNZ(v) { this.Z = v === 0; this.N = (v & 0x80) !== 0; }
    fetch() { const v = this.mem[this.PC]; this.PC = (this.PC + 1) & 0xff; return v; }
    write(addr, v) { this.mem[addr & 0xff] = v & 0xff; this.lastWrite = addr & 0xff; }
    push(v) { this.write(this.SP, v); this.SP = (this.SP - 1) & 0xff; }
    pop() { this.SP = (this.SP + 1) & 0xff; return this.mem[this.SP]; }

    // Run one instruction. Returns false once halted.
    step() {
      if (this.halted) return false;
      this.lastWrite = -1;
      const at = this.PC;
      const op = this.fetch();
      const info = BY_OPCODE.get(op);
      if (!info) {
        this.halted = true;
        this.error = 'illegal opcode 0x' + hex(op) + ' at 0x' + hex(at);
        return false;
      }
      const arg = sizeOf(info.mode) === 2 ? this.fetch() : 0;
      this.cycles++;
      let r;
      switch (op) {
        case 0x00: this.halted = true; this.PC = at; return false;
        case 0x01: break;
        case 0x02: this.A = arg; this.setNZ(this.A); break;
        case 0x03: this.A = this.mem[arg]; this.setNZ(this.A); break;
        case 0x04: this.A = this.mem[this.B]; this.setNZ(this.A); break;
        case 0x05: this.write(arg, this.A); break;
        case 0x06: this.write(this.B, this.A); break;
        case 0x07: this.B = arg; break;
        case 0x08: this.B = this.mem[arg]; break;
        case 0x09: this.write(arg, this.B); break;
        case 0x10: case 0x11:
          r = this.A + (op === 0x10 ? this.B : arg);
          this.C = r > 0xff; this.A = r & 0xff; this.setNZ(this.A); break;
        case 0x12: case 0x13:
          r = this.A - (op === 0x12 ? this.B : arg);
          this.C = r < 0; this.A = r & 0xff; this.setNZ(this.A); break;
        case 0x14: this.A &= this.B; this.setNZ(this.A); break;
        case 0x15: this.A |= this.B; this.setNZ(this.A); break;
        case 0x16: this.A ^= this.B; this.setNZ(this.A); break;
        case 0x17: this.A = (this.A + 1) & 0xff; this.setNZ(this.A); break;
        case 0x18: this.A = (this.A - 1) & 0xff; this.setNZ(this.A); break;
        case 0x19: this.B = (this.B + 1) & 0xff; this.setNZ(this.B); break;
        case 0x1A: this.B = (this.B - 1) & 0xff; this.setNZ(this.B); break;
        case 0x1B: this.C = (this.A & 0x80) !== 0; this.A = (this.A << 1) & 0xff; this.setNZ(this.A); break;
        case 0x1C: this.C = (this.A & 1) !== 0; this.A >>= 1; this.setNZ(this.A); break;
        case 0x1D: case 0x1E:
          r = this.A - (op === 0x1D ? this.B : arg);
          this.C = r < 0; this.setNZ(r & 0xff); break;
        case 0x1F: this.B = this.A; break;
        case 0x20: this.A = this.B; this.setNZ(this.A); break;
        case 0x30: this.PC = arg; break;
        case 0x31: if (this.Z) this.PC = arg; break;
        case 0x32: if (!this.Z) this.PC = arg; break;
        case 0x33: if (this.C) this.PC = arg; break;
        case 0x34: if (!this.C) this.PC = arg; break;
        case 0x35: if (this.N) this.PC = arg; break;
        case 0x40: this.push(this.A); break;
        case 0x41: this.A = this.pop(); this.setNZ(this.A); break;
        case 0x42: this.push(this.PC); this.PC = arg; break;
        case 0x43: this.PC = this.pop(); break;
        case 0x50: this.output.push(this.A); break;
      }
      return true;
    }

    run(maxSteps = 100000) {
      let n = 0;
      while (n < maxSteps && this.step()) n++;
      return n;
    }
  }

  function hex(v, width = 2) { return v.toString(16).toUpperCase().padStart(width, '0'); }

  // Disassemble the instruction at addr: { text, size }.
  function disassemble(mem, addr) {
    const info = BY_OPCODE.get(mem[addr]);
    if (!info) return { text: '.db 0x' + hex(mem[addr]), size: 1 };
    const arg = mem[(addr + 1) & 0xff];
    const text = {
      none: info.mnemonic,
      imm: info.mnemonic + ' #' + arg,
      addr: info.mnemonic + ' 0x' + hex(arg),
      ind: info.mnemonic + ' [B]',
    }[info.mode];
    return { text, size: sizeOf(info.mode) };
  }

  const api = { CPU, assemble, disassemble, AsmError, ISA, hex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CPU8 = api;
})(typeof window !== 'undefined' ? window : globalThis);
