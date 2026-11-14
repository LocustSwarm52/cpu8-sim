# cpu8-sim

An 8-bit CPU simulator that runs in the browser, with its own assembly language and a two-pass assembler. Write a program, assemble it, and step through it while the registers, flags and all 256 bytes of memory update live.

**Live demo:** `https://<your-username>.github.io/cpu8-sim/`

## Features

- 38 instructions: loads and stores, arithmetic, logic, shifts, compare, conditional jumps, a stack, and subroutine calls
- Four addressing modes: none, immediate (`#5`), direct (`0x20` or a label), and indirect through register B (`[B]`)
- Two-pass assembler with labels, `.db` data, `.org`, and error messages that point at the line
- Step or run at an adjustable speed, with the program counter, operand, stack pointer, and last memory write highlighted in the memory grid
- Five example programs: count down, Fibonacci, multiply with a subroutine, sum an array, and powers of two
- No dependencies and no build step

## How it works

**The machine.** Two 8-bit registers (`A`, `B`), an 8-bit program counter and stack pointer, and three flags: zero (`Z`), carry (`C`), and negative (`N`). Memory is 256 bytes shared by code, data, and the stack, which grows down from `0xFF`. Each instruction is one byte, followed by one operand byte for immediate and direct modes.

**The assembler** (`assemble()` in `cpu.js`) makes two passes over the source:

1. **Pass 1** walks every line, records the address of each label, and works out how many bytes each instruction takes from its addressing mode. Labels can therefore be used before they are defined.
2. **Pass 2** writes the opcode and operand bytes, replacing each label with its address from pass 1.

**The CPU** (`CPU.step()`) runs a fetch-decode-execute cycle: read the opcode at `PC`, read an operand byte if the mode needs one, then update registers, flags, or memory. `ADD` and `SUB` set carry on overflow and borrow, which is how the Fibonacci example knows when to stop.

## Example

```asm
; Multiply 13 x 11 with repeated addition
        LDA #13
        STA x
        LDA #11
        STA y
        CALL mul
        OUT             ; prints 143
        HLT

mul:    LDA #0
        STA result
        LDA y
        STA counter
mloop:  LDA counter
        JZ mdone
        DEC
        STA counter
        LDA result
        LDB x
        ADD
        STA result
        JMP mloop
mdone:  LDA result
        RET

x:       .db 0
y:       .db 0
result:  .db 0
counter: .db 0
```

## Instruction set

| Group | Instructions |
|---|---|
| Load and store | `LDA #n`, `LDA addr`, `LDA [B]`, `STA addr`, `STA [B]`, `LDB #n`, `LDB addr`, `STB addr`, `TAB`, `TBA` |
| Arithmetic | `ADD`, `ADD #n`, `SUB`, `SUB #n`, `INC`, `DEC`, `INB`, `DEB` |
| Logic and shifts | `AND`, `OR`, `XOR`, `SHL`, `SHR` |
| Compare and jump | `CMP`, `CMP #n`, `JMP`, `JZ`, `JNZ`, `JC`, `JNC`, `JN` |
| Stack and calls | `PUSH`, `POP`, `CALL addr`, `RET` |
| Other | `OUT`, `NOP`, `HLT` |

Instructions without an operand work on `A` and `B` (for example, `ADD` sets `A = A + B`).

## Run it

Open `index.html` in a browser. To run the tests (Node 18 or newer):

```
npm test
```

The tests check every example program's output, label resolution, assembler error messages, flags, and the call stack.

## Files

| File | What it holds |
|---|---|
| `cpu.js` | Instruction set, assembler, CPU, and disassembler |
| `examples.js` | Example programs |
| `index.html` | The interface |
| `test.js` | Tests |
