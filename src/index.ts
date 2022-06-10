import Lexer from "./lexer.ts";
import Parser from "./parser.ts";
import Compiler from "./compiler.ts";
import { path as Path, readFile, writeFile } from "./utils.ts";
import { parseArgs } from "./cliParser.ts";

const __filename = new URL('', import.meta.url).pathname;
const __dirname = new URL('.', import.meta.url).pathname;

const args = [...Deno.args];

const DEBUG: number = 0;

const project = "tests/project";
const argList = parseArgs(args);

// console.log(argList)

if (argList.hasArg("build")) {
  const data = argList.findArgWithParam("build", 1);
  
  const folder = !data || data[1].length < 1 ? __dirname : Path.join(__dirname, "..", data[1][0].value);
  const release = argList.hasArg("release");

  await Compiler.buildProject(folder, release);
}

// const fileData = await readFile(file + ".dime");

// const lexer = new Lexer(file + ".dime", fileData);
// const tokens = lexer.tokenize();

// if (DEBUG === 1)
//   console.log(tokens);

// const parser = new Parser(tokens, file + ".dime");
// const ast = parser.parse();

// if (DEBUG === 3 || DEBUG === 2)
//   console.log(ast.block);

// const compiler = new Compiler(ast, file + ".dime");
// const code = compiler.compile();

// console.log(code);

// await writeFile(file + ".asm", code)