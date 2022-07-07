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

const strings: string[] = new Array(255).fill("");
const strIndices: boolean[] = new Array(255).fill(false);

function wat_printStr(index: number) {
  const mem = new Uint8Array(memory.buffer);

  if (strIndices[index]) {
    Deno.stdout.writeSync(new TextEncoder().encode(strings[index]));
    return;
  }

  for (let i = index; mem[i] != 0; i++) {
    let char = new Uint8Array(1);
    char.set([mem[i]], 0);
    Deno.stdout.writeSync(char);

    strings[index] += new TextDecoder("utf-8").decode(char);
  }

  strIndices[index] = true;
}

let returnValue = main(5);
// console.log(new Uint8Array(memory.buffer));
console.log("\nReturn value:", returnValue);
// wat_printStr(main());