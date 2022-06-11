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
  hasReturned: boolean;
  headerLoc: number;

  returnValue?: string;
  blocks: number;

  variables: VariableList;

  constructor(name: string, isDef: boolean, ast: AST) {
    this.name = name;
    this.ast = ast;
    this.isDef = isDef;
    this.headerLoc = 0;
    this.hasReturned = false;

    this.blocks = 0;

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

  codeTop: string[];

  currentFunction: FunctionDef | null;
  currentIfBlock?: Record<string, any>;

  customTypes: Record<string, AST>;

  constructor(ast?: AST) {
    this.ast = ast;
    this.code = [];

    this.stringList = new StringList();
    this.funcList = new FunctionList();
    this.customTypes = {};

    this.codeTop = ["(module"];

    this.currentFunction = null;
  };

  getFullCode(): string {
    let fullCode = this.codeTop.join("\n") + "\n";
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
    this.currentFunction.headerLoc = funcHeaderLoc;
    this.code.push(funcHeader);

    let funcHasReturn = false;
    let funcReturn;

    let returnBlockLoc = this.code.length;
    this.code.push(`\t\t(block $funcleave`)

    for (let exp of block) {
      this.compile(exp);

      funcHasReturn = exp.kind === ASTTypes.Return;

      if (funcHasReturn)
        funcReturn = exp;
    }

  //   if (funcHasReturn) {
  //     const funcReturnTNode = funcReturn?.dataType;
  //     let funcReturnType = funcReturnTNode?.value?.value;

  //     if (!funcReturnType)
  //       funcReturnType = typeNode.value.value;

  //     if (funcReturnType != typeNode.value.value && funcReturn) {
  //       new DimeError(
  //         `Invalid value returned. Value has type '${funcReturnType}' while function has '${typeNode.value.value}.'`,
  //         funcReturn.assign.value.pos || null, [funcReturn.value]
  //       );
  //     }

  //     if (funcReturnType == "char" || funcReturnType == "str" || funcReturnType == "bool")
  //       funcReturnType = "i32";

  //     funcHeader += ` (result ${funcReturnType})`;
  //     this.code[returnBlockLoc] += ` (result ${funcReturnType})`;
  // }

  //   this.code[funcHeaderLoc] = funcHeader;
    this.code.push("\t\t)\n\t)");
  }

  compileReturn(node: AST) {
    this.compile(node.assign);
    this.code.push(`\t\tbr $funcleave`);

    if (this.currentFunction?.hasReturned) {
      if (this.currentIfBlock) {
        if (this.currentIfBlock.elseReturn === false) {
          this.code[this.currentIfBlock.headerLoc] += ` (result ${this.currentFunction.returnValue})`;
        }
      }
      return;
    }

    (this.currentFunction as FunctionDef).hasReturned = true;

    const typeNode = this.currentFunction?.ast.dataType as AST;
    const funcReturnTNode = node.dataType;
    let funcReturnType = typeNode.value.value;

    if (funcReturnType != typeNode.value.value) {
      new DimeError(
        `Invalid value returned. Value has type '${funcReturnType}' while function has '${typeNode.value.value}.'`,
        node.assign.value.pos || null, [node.value]
      );
    }

    if (funcReturnType == "void")
      return;

    if (funcReturnType == "char" || funcReturnType == "str" || funcReturnType == "bool")
      funcReturnType = "i32";

    if (!this.currentFunction)
      return;

    let index = this.currentFunction.variables.varCount - this.currentFunction.ast.args.length;
    if (index <= 0) {
      index = 1;
    }

    this.code[this.currentFunction?.headerLoc as number] += ` (result ${funcReturnType})`;
    this.code[(this.currentFunction?.headerLoc as number) + index] += ` (result ${funcReturnType})`;
    (this.currentFunction as FunctionDef).returnValue = funcReturnType;

    if (this.currentIfBlock) {
      if (this.currentIfBlock.elseReturn === false) {
        this.code[this.currentIfBlock.headerLoc] += ` (result ${funcReturnType})`;
      }
    }
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

    // console.log(node, left);

    const varName = left.value.value;
    const varType = this.getRType(left).value.value;
    let wasmType = conversions[varType];

    const op = node.value.value;

    let notDefiners = ["++", "--", "+=", "-=", "*=", "%="];

    if (func.variables.hasVariable(varName) && !notDefiners.includes(op)) {
      new DimeError("Variable %v is already defined. Variables can only have one definition.", left.value.pos, [left.value]);
    } else if (!notDefiners.includes(op)) {
      func.variables.addVariable(varName, left);
    }

    let rType = this.getRType(right)?.value?.value;
    if (!rType) {
      switch (op) {
        case "--":
        case "++":
          rType = "i32";
          break;
      }
    }

    if (varType !== rType)
      new DimeError(`Cannot assign a '${rType}' to '${varType}' on variable %v. Type mismatch.`, right.value.pos, [left.value])

    if (!notDefiners.includes(op))
      this.compile(left);
    else {
      this.code.push(`\t\tlocal.get \$${varName}`);
    }

    if (op == "++") {
      this.code.push(`\t\ti32.const 1`);
      this.code.push(`\t\ti32.add`);
    } else if (op == "--") {
      this.code.push(`\t\ti32.const 1`);
      this.code.push(`\t\ti32.sub`);
    }

    this.compile(right);
    
    if (!notDefiners.includes(op)) {
      let value = (this.code.pop() as string).trim();
      this.code.push(`\t\t(local.set \$${varName} (${value}))`);
    } else {
      this.code.push(`\t\t(local.set \$${varName})`);
    }

  }

  compileVariable(node: AST) {
    const func = this.currentFunction as FunctionDef;
    const varName = node.value.value;
    const varType = node.dataType.value.value;
    let wasmType = conversions[varType];

    func.variables.addVariable(varName, node);
    let pos = this.currentFunction?.headerLoc as number;
    let newVar = [`\t\t(local \$${varName} ${wasmType})`];

    this.code = this.code.slice(0, pos + 1).concat(newVar).concat(this.code.slice(pos + 1));

    // this.code.push(`\t\t(local \$${varName} ${wasmType})`);
  }

  getRType(node: AST): AST {
    if (node.kind == ASTTypes.Identifier) {
      if (!this.currentFunction?.variables?.hasVariable(node.value.value)) {
        return this.customTypes[node.value.value];
      }

      const variable = this.currentFunction?.variables.getVariable(node.value.value) as Variable;

      return variable.dataType;
    } else if (node.kind == ASTTypes.FunctionCall) {
      const func = this.funcList.functions[node.value.value];

      return func.ast.dataType;
    } else {
      return node.dataType;
    }
  }

  compileBinaryOp(node: AST) {
    const { left, op, right } = node;

    this.compile(left);
    this.compile(right);

    let lDataType = this.getRType(left);
    let rDataType = this.getRType(right);

    if (lDataType.value.value !== rDataType.value.value)
      new DimeError("Cannot perform operation. Type mismatch.", op.pos, [op]);

    const binType = conversions[lDataType.value.value];
    
    if (op.value == "+") {
      this.code.push(`\t\t${binType}.add`);
    } else if (op.value == "++") {
      this.code.push(`\t\t${binType}.add`);
    } else if (op.value == "-") {
      this.code.push(`\t\t${binType}.sub`);
    } else if (op.value == "--") {
      this.code.push(`\t\t${binType}.sub`);
    } else if (op.value == "*") {
      this.code.push(`\t\t${binType}.mul`);
    } else if (op.value == "/") {
      this.code.push(`\t\t${binType}.div_s`);
    } else if (op.value == "%") {
      this.code.push(`\t\t${binType}.div_s`)
    } else if (op.value == "&&") {
      this.code.push(`\t\t${binType}.and`);
    } else if (op.value == "||") {
      this.code.push(`\t\t${binType}.or`);
    } else if (op.value == ">") {
      this.code.push(`\t\t${binType}.gt_s`);
    } else if (op.value == "<") {
      this.code.push(`\t\t${binType}.lt_s`);
    } else if (op.value == "==") {
      this.code.push(`\t\t${binType}.eq`);
    }
  }

  compileIf(node: AST) {
    // condition, block, els

    const { condition, block, els } = node;

    // TODO: Type check condition
    this.compile(condition);

    let ifHeaderLoc = this.code.length;
    this.code.push(`\t\tif`);

    let oldIfBlock = this.currentIfBlock;
    this.currentIfBlock = {
      thenReturn: false,
      headerLoc: ifHeaderLoc
    }

    for (const exp of block)  {
      this.compile(exp);
    }
    this.currentIfBlock = oldIfBlock;

    if (block.length == 0) {
      this.code.push("\t\tnop");
    }

    if (els) {
      this.currentIfBlock = {
        elseReturn: false,
        headerLoc: ifHeaderLoc
      }
      this.code.push(`\n\t\telse\n`);

      for (const exp of els.block) {
        this.compile(exp);
      }
      this.currentIfBlock = oldIfBlock;

      if (els.block.length == 0) {
        this.code.push("\t\tnop");
      }
  }

    this.code.push(`\n\t\tend`);
  }

  compileWhileLoop(node: AST) {
    const { condition, block } = node;

    const oldIfBlock = this.currentIfBlock;
    this.currentIfBlock = {
      thenReturn: false,
      headerLoc: this.code.length
    };

    this.code.push(`\t\t(block $block_${this.currentFunction?.blocks}`);
    let outerBlock = this.currentFunction?.blocks as number;
    
    (this.currentFunction as FunctionDef).blocks++;
    let oldHeaderLen = this.code[this.code.length - 1].length;


    this.code.push(`\t\t(loop $loop_${this.currentFunction?.blocks}`);
    let loopBlock = this.currentFunction?.blocks as number;
    (this.currentFunction as FunctionDef).blocks++;

    this.compile(condition);
    this.code.push(`\t\ti32.const 1`);
    this.code.push(`\t\ti32.xor`);
    this.code.push(`\t\tbr_if \$block_${outerBlock}`);

    for (const exp of block) {
      this.compile(exp);
    }

    if (this.currentFunction?.returnValue) {
      this.code[this.currentIfBlock.headerLoc] += ` (result ${this.currentFunction?.returnValue as string})`;
      this.code[this.currentIfBlock.headerLoc + 1] += ` (result ${this.currentFunction?.returnValue as string})`;
    }

    let returned = this.currentIfBlock.thenReturn;

    this.currentIfBlock = oldIfBlock;

    if (!returned) {
      this.code.push(`\t\tbr \$loop_${loopBlock}`);
    }
    this.code.push(`\t\t)\n\t\t)`);

  }

  compileExtern(node: AST) {
    const { assign } = node;

    const { args, dataType, value: token } = assign;

    this.funcList.addFunction(assign, true);

    let funcParamList = ``;
    let funcReturnType = ``;

    for (const arg of args) {
      let argType = this.getRType(arg).value.value;

      if (argType == "char" || argType == "str" || argType == "bool")
        argType = "i32";

      funcParamList += ` (param ${argType})`;
    }

    if (dataType || this.getRType(assign).value.value != "void") {
      let argType = this.getRType(assign).value.value;

      if (argType == "char" || argType == "str" || argType == "bool")
        argType = "i32";

      if (argType != "void")
        funcReturnType = ` (result ${argType})`;
    }

    this.codeTop.push(`\t(import "std" "${token.value}" (func \$${token.value}${funcParamList}${funcReturnType}))`);
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

      case ASTTypes.If:
        this.compileIf(node);
        return "If";

      case ASTTypes.WhileLoop:
        this.compileWhileLoop(node);
        return "WhileLoop";

      case ASTTypes.Extern:
        this.compileExtern(node);
        return "Extern";

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