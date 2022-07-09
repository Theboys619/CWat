clear
deno run --lock=lock.json --lock-write --allow-all src/index.ts build tests/testProj
wat2wasm .\tests\testProj\builds\debug\testProj.wat