import { DimeError, DimeSyntaxError } from "./errors.ts";
import AST, { ASTTypes } from "./ast.ts";
import Token, { TokenTypes, Position } from "./token.ts";
import Lexer, {
  dataTypes,
  operators,
  keywords,
  PRECEDENCE,
  assignments,
  noRightHand
} from "./lexer.ts";
import Parser from "./parser.ts";

import { path as Path, exists, mkdir, readFile, readFileSync, writeFile } from "./utils.ts";

const conversions: Record<string, string> = {
  "i32": "i32",
  "f32": "f32",
  "f64": "f64",
  "i64": "i64",
  "char": "i32",
  "bool": "i32",
  "str": "i32"
}

class StringList {
  strings: string[];
  memSize: number;

  constructor() {
    this.strings = [];
    this.memSize = 0;
  }

  newString(str: string) {
    this.strings.push(str + '\0');
    this.memSize += str.length + 1;

    return this.memSize - str.length - 1;
  }

  getString(index: number) {
    let size = 0;
    for (let string of this.strings) {
      let str = "";
      let c = 0;
      while (string[c] != '\0') {
        if (size >= index) {
          str += string[c];
        }

        size++;
        c++;
      }

      return str;
    }

    return "";
  }
}

class Variable {
  name: string;
  index: number;

  dataType: AST;
  
  constructor(name: string, index: number, dataType: AST) {
    this.name = name;
    this.index = index;
    this.dataType = dataType;
  }
}

class VariableList {
  variables: Record<string, Variable>;
  varCount: number;

  constructor() {
    this.variables = {};
    this.varCount = 0;
  }

  hasVariable(name: string): boolean {
    return this.variables.hasOwnProperty(name);
  }

  addVariable(name: string, node: AST): Variable {
    const variable = (this.variables[name] = new Variable(name, this.varCount, node.dataType));
    this.varCount++;

    return variable;
  }

  getVariable(name: string): Variable {
    return this.variables[name];
  }
}

class FunctionDef {
  name: string;
  ast: AST;
  isDef: boolean;

  variables: VariableList;

  constructor(name: string, isDef: boolean, ast: AST) {
    this.name = name;
    this.ast = ast;
    this.isDef = isDef;

    this.variables = new VariableList();
  }
}

class FunctionList {
  functions: Record<string, FunctionDef>;

  constructor() {
    this.functions = {};
  }

  hasFunction(name: string) {
    return this.functions.hasOwnProperty(name);
  }

  hasFunctionDef(name: string) {
    return this.hasFunction(name) && this.functions[name].isDef;
  }

  addFunction(ast: AST, isDef: boolean = false): FunctionDef {
    return (this.functions[ast.value.value] = new FunctionDef(ast.value.value, isDef, ast));
  }
}

export default class Compiler {
  code: string[];
  ast?: AST;
  projPath!: string;

  stringList: StringList;
  funcList: FunctionList;

  codeTop: string;

  currentFunction: FunctionDef | null;

  constructor(ast?: AST) {
    this.ast = ast;
    this.code = [];

    this.stringList = new StringList();
    this.funcList = new FunctionList();

    this.codeTop = "(module";

    this.currentFunction = null;
  };

  getFullCode(): string {
    let fullCode = this.codeTop;
    fullCode += "\n";
    fullCode += "\t(memory (export \"memory\") 1)\n";
    
    let strMemSize = 0;
    for (let i = 0; i < this.stringList.strings.length; i++) {
      const index = strMemSize;
      const string = this.stringList.strings[i];
      strMemSize += string.length;

      fullCode += `\t(data (i32.const ${index}) \"${string}\")\n`;
    }
    
    fullCode += this.code.join("\n") + "\n)";

    return fullCode;
  }

  compileFunctionDef(node: AST) {
    this.funcList.addFunction(node, true);
  }

  compileFunctionCall(node: AST) {
    const funcName = node.value.value;

    if (!this.funcList.hasFunction(funcName))
      new DimeError(`Trying to call function ${funcName}, but it does not exist!`, node.value.pos, [node.value]);

    for (let arg of node.args) {
      this.compile(arg)
    }

    this.code.push(`\t\tcall \$${funcName}`);
  }

  compileFunction(node: AST) {
    // (func $name (export "name") (param i32) (result i32)
    // )

    const typeNode = node.dataType;
    const funcName = node.value.value;
    const args = node.args;
    const block = node.block;

    this.currentFunction = this.funcList.addFunction(node, false);

    let funcHeader = `\t(func \$${funcName}`;

    if (node.isExported) {
      funcHeader += ` (export \"${funcName}\")`;
    }
    
    for (const arg of args) {
      const argTypeNode = arg.dataType;
      const argName = arg.value.value;
      let argType = argTypeNode.value.value;

      if (argType == "char" || argType == "str" || argType == "bool")
        argType = "i32";

      funcHeader += ` (param \$${argName} ${argType})`;

      this.currentFunction.variables.addVariable(arg.value.value, arg);
    }

    const funcHeaderLoc = this.code.length;
    this.code.push(funcHeader);

    let funcHasReturn = false;
    let funcReturn;

    for (let exp of block) {
      this.compile(exp);

      funcHasReturn = exp.kind === ASTTypes.Return;

      if (funcHasReturn)
        funcReturn = exp;
    }

    if (funcHasReturn) {
      const funcReturnTNode = funcReturn?.dataType;
      let funcReturnType = funcReturnTNode?.value?.value;

      if (!funcReturnType)
        funcReturnType = typeNode.value.value;

      if (funcReturnType != typeNode.value.value && funcReturn) {
        new DimeError(
          `Invalid value returned. Value has type '${funcReturnType}' while function has '${typeNode.value.value}.'`,
          funcReturn.assign.value.pos || null, [funcReturn.value]
        );
      }

      if (funcReturnType == "char" || funcReturnType == "str" || funcReturnType == "bool")
        funcReturnType = "i32";

      funcHeader += ` (result ${funcReturnType})`;
    }

    this.code[funcHeaderLoc] = funcHeader;
    this.code.push("\t)");
  }

  compileReturn(node: AST) {
    this.compile(node.assign);
  }

  compileInt(node: AST) {
    const value = node.value.value;

    this.code.push(`\t\ti32.const ${value}`);
  }

  compileFloat(node: AST) {
    const value = node.value.value;

    this.code.push(`\t\tf32.const ${value}`);
  }

  compileBool(node: AST) {
    const value = node.value.value == "true" ? 1 : 0;

    this.code.push(`\t\ti32.const ${value}`);
  }

  compileString(node: AST) {
    const value = node.value.value;

    const index = this.stringList.newString(value);

    this.code.push(`\t\ti32.const ${index}`);
    // this.code.push(`\t\ti32.load8_u`);
  }

  compileIdentifier(node: AST) {
    if (!this.currentFunction)
      new DimeError("TODO: Cannot create global variables! Tried using variable '%v.'", node.value.pos, [node.value]);

    const func = this.currentFunction as FunctionDef;

    const varName = node.value.value;

    if (!func.variables.hasVariable(varName)) {
      new DimeError("Variable %v is not defined. Tried using variable that was not defined.", node.value.pos, [node.value]);
    }

    const variable = func.variables.getVariable(varName);

    this.code.push(`\t\tlocal.get \$${variable.name}`);
  }

  compileAssign(node: AST) {
    if (!this.currentFunction)
      new DimeError("TODO: Cannot create global variables! Tried creating variable %v.", node.value.pos, [node.value]);
    
    const { left, right } = node;
    const func = this.currentFunction as FunctionDef;

    const varName = left.value.value;
    const varType = left.dataType.value.value;
    let wasmType = conversions[varType];

    if (func.variables.hasVariable(varName)) {
      new DimeError("Variable %v is already defined. Variables can only have one definition.", node.value.pos, [node.value]);
    } else {
      func.variables.addVariable(varName, left);
    }

    const rType = this.getRType(right).value.value;
    if (varType !== rType)
      new DimeError(`Cannot assign a '${rType}' to '${varType}' on variable %v. Type mismatch.`, right.value.pos, [left.value])

    this.compile(left);

    this.compile(right);
    let value = (this.code.pop() as string).trim();

    this.code.push(`\t\t(local.set \$${varName} (${value}))`);
  }

  compileVariable(node: AST) {
    const func = this.currentFunction as FunctionDef;
    const varName = node.value.value;
    const varType = node.dataType.value.value;
    let wasmType = conversions[varType];

    func.variables.addVariable(varName, node);
    this.code.push(`\t\t(local \$${varName} ${wasmType})`);
  }

  getRType(node: AST): AST {
    if (node.kind == ASTTypes.Identifier) {
      const variable = this.currentFunction?.variables.getVariable(node.value.value) as Variable;

      return variable.dataType;
    } else {
      return node.dataType;
    }
  }

  compileBinaryOp(node: AST) {
    const { left, op, right } = node;

    this.compile(right);
    this.compile(left);

    let lDataType;
    let rDataType;

    if (left.kind == ASTTypes.Identifier) {
      const variable = this.currentFunction?.variables.getVariable(left.value.value) as Variable;

      lDataType = variable.dataType.value.value;
    } else {
      lDataType = left.dataType.value.value;
    }

    if (right.kind == ASTTypes.Identifier) {
      const variable = this.currentFunction?.variables.getVariable(right.value.value) as Variable;

      rDataType = variable.dataType.value.value;
    } else {
      rDataType = right.dataType.value.value;
    }

    if (lDataType !== rDataType)
      new DimeError("Cannot perform operation. Type mismatch.", op.pos, [op]);

    const binType = conversions[lDataType];
    
    if (op.value == "+") {
      this.code.push(`\t\t${binType}.add`);
    } else if (op.value == "-") {
      this.code.push(`\t\t${binType}.sub`);
    } else if (op.value == "*") {
      this.code.push(`\t\t${binType}.mul`);
    } else if (op.value == "/") {
      this.code.push(`\t\t${binType}.div_s`);
    } else if (op.value == "%") {
      this.code.push(`\t\t${binType}.div_s`)
    }
  }

  compile(node: AST): keyof typeof ASTTypes {
    switch (node.kind) {
      case ASTTypes.Scope: {
        for (const exp of node.block) {
          this.compile(exp);
        }
        break;
      }

      case ASTTypes.Integer:
        this.compileInt(node);
        return "Integer";
      case ASTTypes.Double:
        this.compileFloat(node);
        return "Double";
      case ASTTypes.Boolean:
        this.compileBool(node);
        return "Boolean";
      case ASTTypes.String:
        this.compileString(node);
        return "String";

      case ASTTypes.Function:
        this.compileFunction(node);
        return "Function";

      case ASTTypes.FunctionCall:
        this.compileFunctionCall(node);
        return "FunctionCall";

      case ASTTypes.FunctionDef:
        this.compileFunctionDef(node);
        return "FunctionDef";

      case ASTTypes.Return:
        this.compileReturn(node);
        return "Return";

      case ASTTypes.Binary:
        this.compileBinaryOp(node);
        return "Binary";

      case ASTTypes.Identifier:
        this.compileIdentifier(node);
        return "Identifier";

      case ASTTypes.Assign:
        this.compileAssign(node);
        return "Assign";

      case ASTTypes.Variable:
        this.compileVariable(node);
        return "Variable";

      default:
        return "Null";
    }
    
    return "Null";
  }

  static async buildProject(projFolder: string, release: boolean = true) {
    const buildPath = Path.join(projFolder, "./builds").slice(1);
    const releaseFolder = Path.join(buildPath, "./release");
    const debugFolder = Path.join(buildPath, "./debug");

    const buildFolderExists = await exists(buildPath);
    const releaseFolderExists = buildFolderExists
      ? await exists(releaseFolder)
      : false;
    const debugFolderExists = buildFolderExists
      ? await exists(debugFolder)
      : false;

    // Entry point file
    const mainFile = Path.join(projFolder, "./main.dime").slice(1);
    const mainFileExists = await exists(mainFile);

    const outputFile = !(projFolder.includes("/") || projFolder.includes("\\"))
      ? projFolder + ".wat"
      : projFolder.split(/\/|\\/g)[projFolder.split(/\/|\\/g).length - 1] + ".wat";

    if (!mainFileExists) {
      new DimeError("Entry point file does not exist! File should be at root and called 'main.dime", null, []);
    }
    
    if (!buildFolderExists) {
      await mkdir(buildPath);
    }

    const fileData = await readFile(mainFile);

    const lexer = new Lexer(mainFile, fileData);
    const tokens = lexer.tokenize();

    // if (DEBUG === 1)
    //   console.log(tokens);

    const parser = new Parser(tokens, mainFile);
    const ast = parser.parse();

    // if (DEBUG === 3 || DEBUG === 2)
    //   console.log(ast.block);

    const compiler = new Compiler(ast);
    compiler.compile(ast);
    const code = compiler.getFullCode();

    // console.log(code);

    if (release) {
      if (!releaseFolderExists) {
        await mkdir(releaseFolder);
      }

      await writeFile(Path.join(releaseFolder, outputFile), code);
    } else {
      if (!debugFolderExists) {
        await mkdir(debugFolder);
      }

      await writeFile(Path.join(debugFolder, outputFile), code);
    }
  }
};