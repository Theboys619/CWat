const IMPORTS = {
  std: {
    print_str: wat_printStr
  }
};

const wasmBin = await Deno.readFile("./testProj.wasm");
const module = new WebAssembly.Module(wasmBin);
const instance = new WebAssembly.Instance(module, IMPORTS);
const memory = instance.exports.memory as WebAssembly.Memory;
const main = instance.exports.main as CallableFunction;

function wat_printStr(index: number) {
  const mem = new Uint8Array(memory.buffer);

  for (let i = index; mem[i] != 0; i++) {
    let char = new Uint8Array(1);
    char.set([mem[i]], 0);
    Deno.stdout.writeSync(char);
  }
}

let returnValue = main(5);
console.log();
console.log("Return value:", returnValue);
// wat_printStr(main());