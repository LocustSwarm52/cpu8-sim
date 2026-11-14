// Example programs shown in the simulator's dropdown.
(function (root) {
  const EXAMPLES = {
    'Count down': `; Count down from 9 to 0, sending each value to OUT.
        LDA #9
loop:   OUT
        DEC
        CMP #255        ; DEC from 0 wraps to 255
        JNZ loop
        HLT
`,

    'Fibonacci': `; Output Fibonacci numbers until the next one overflows 8 bits.
        LDA #0
        STA prev
        LDA #1
        STA curr
next:   LDA curr
        OUT
        LDB prev
        ADD             ; A = curr + prev
        JC done         ; carry means the result passed 255
        TAB             ; B = new value
        LDA curr
        STA prev
        STB curr
        JMP next
done:   HLT

prev:   .db 0
curr:   .db 0
`,

    'Multiply (subroutine)': `; Multiply 13 x 11 with a subroutine that uses repeated addition.
        LDA #13
        STA x
        LDA #11
        STA y
        CALL mul
        OUT             ; 143
        HLT

; mul: A = x * y (low 8 bits). Uses result and counter.
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
`,

    'Sum an array': `; Add up a list with indirect addressing: A = mem[B].
        LDA #0
        STA sum
        LDA #data
        STA ptr         ; ptr holds the address of the next element
loop:   LDB ptr
        TBA
        CMP #end        ; stop when ptr reaches the end marker
        JZ done
        LDA [B]         ; A = element
        LDB sum
        ADD             ; A = element + sum
        STA sum
        LDB ptr
        INB
        STB ptr
        JMP loop
done:   LDA sum
        OUT             ; 3+14+15+92+65 = 189
        HLT

sum:    .db 0
ptr:    .db 0
data:   .db 3, 14, 15, 92, 65
end:
`,

    'Powers of two': `; Shift left to print 1, 2, 4 ... 128.
        LDA #1
loop:   OUT
        SHL
        JNC loop
        HLT
`,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = EXAMPLES;
  else root.CPU8_EXAMPLES = EXAMPLES;
})(typeof window !== 'undefined' ? window : globalThis);
