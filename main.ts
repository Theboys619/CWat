const IMPORTS = {
  std: {
    printStr: wat_printStr
  }
};

const wasmBin = await Deno.readFile("./testProj.wasm");
const module = new WebAssembly.Module(wasmBin);
const instance = new WebAssembly.Instance(module, IMPORTS);
const memory = instance.exports.memory as WebAssembly.Memory;
const main = instance.exports.main as CallableFunction;
const helloWorld = instance.exports.helloWorld as CallableFunction;
const nice = instance.exports.nice as CallableFunction;

function wat_printStr(index: number) {
  const mem = new Uint8Array(memory.buffer);

  for (let i = index; mem[i] != 0; i++) {
    let char = new Uint8Array(1);
    char.set([mem[i]], 0);
    Deno.stdout.writeSync(char);
  }
}

console.log(main());
wat_printStr(helloWorld());
wat_printStr(nice());
// wat_printStr(main());