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
import { Type } from "./type.ts";

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

  dataType: Type;
  
  constructor(name: string, index: number, dataType: Type) {
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
    if (this.hasVariable(name))
      return this.variables[name];

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

  resolveType(node: AST): Type {
    switch (node.kind) {
      case ASTTypes.Identifier: {
        return this.variables.getVariable(node.value.value).dataType;
      }
    }

    return new Type(new Token(TokenTypes.Datatype, "void"));
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

export class DimeClass {
  name: string;
  ast: AST;
  dataType: Type;
  index: number;

  properties: Record<string, DimeClass | Variable>;
  methods: FunctionList;

  propLength: number;

  constructor(ast: AST) {
    this.name = ast.value.value;
    this.ast = ast;
    this.dataType = ast.dataType;

    this.index = 0;

    this.properties = {};
    this.propLength = 0;
    this.methods = new FunctionList();
  }

  addProperty(name: string, prop: DimeClass | Variable): DimeClass | Variable {
    prop.index = this.propLength++;
    this.properties[name] = prop;

    return prop;
  }

  hasMethod(name: string): boolean {
    return this.methods.hasFunction(name);
  }

  addMethodNew(ast: AST, isDef = false): FunctionDef {
    return this.methods.addFunction(ast, isDef);
  }

  addMethod(func: FunctionDef): FunctionDef {
    return (this.methods.functions[func.name] = func);
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

  classes: Record<string, DimeClass>;
  customTypes: Record<string, Type>;

  constructor(ast?: AST) {
    this.ast = ast;
    this.code = [];

    this.stringList = new StringList();
    this.funcList = new FunctionList();
    this.classes = {};
    this.customTypes = {};

    this.codeTop = ["(module"];

    this.currentFunction = null;
  }

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
    fullCode += `\t(global $memoryTop (mut i32) (i32.const ${strMemSize}))\n`;

    fullCode +=
    `\t(func $initObject (export "initObject") (param $size i32) (result i32)
    (local $fullSize i32)
    local.get $size
    i32.const 4
    i32.mul
    local.set $fullSize

    global.get $memoryTop
    global.get $memoryTop
    local.get $fullSize
    i32.add

    global.set $memoryTop
  )\n`;
    
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

    const func = this.funcList.functions[funcName];
    if (func.ast.isConstructor) {
      const cls = this.classes[func.ast.cls.dataType.toString()].propLength;

      this.code.push(`\t\ti32.const ${cls}`);
      this.code.push(`\t\tcall $initObject`);
    }

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
    const isMethod = node.isMethod;
    const args = node.args;
    const block = node.block;

    let newFunc;

    if (isMethod) {
      if (node.isConstructor) {
        newFunc = this.funcList.addFunction(node, false);
        this.classes[node.cls.dataType.toString()].addMethod(newFunc);
      } else {
        newFunc = this.classes[node.cls.dataType.toString()].addMethodNew(node, false);
      }
    } else {
      newFunc = this.funcList.addFunction(node, false)
    }

    this.currentFunction = newFunc as FunctionDef;

    let funcHeader = `\t(func \$${funcName}`;

    if (node.isExported) {
      funcHeader += ` (export \"${funcName}\")`;
    }
    
    for (const arg of args) {
      const argTypeNode = arg.dataType;
      const argName = arg.value.value;
      let argType = argTypeNode.convertType();

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

    if (newFunc.ast.isConstructor) {
      this.code[this.currentFunction.headerLoc] += ` (result i32)`;
      this.code.push("\t\t)\n\t\tlocal.get $this\n\t)");
    } else {
      this.code.push("\t\t)\n\t)");
    }

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

    const funcReturnType = this.currentFunction?.ast.dataType as Type;
    let funcReturnTNode = node.dataType;

    if (!funcReturnTNode) {
      if (node.assign && node.assign.kind == ASTTypes.Identifier) {
        funcReturnTNode = this.currentFunction?.resolveType(node.assign) as Type;
      } else {
        funcReturnTNode = new Type(new Token(TokenTypes.Datatype, "void", node.value.pos.copy()));
      }
    }

    if (!funcReturnType.compareTo(funcReturnTNode)) {
      new DimeError(
        `Invalid value returned. Value has type '${funcReturnTNode.toString()}' while function has '${funcReturnType.toString()}.'`,
        node.assign.value.pos || null, [node.value]
      );
    }

    if (funcReturnType.convertType() == "void")
      return;

    if (!this.currentFunction)
      return;

    let index = this.currentFunction.variables.varCount;
    if (this.currentFunction.ast.args.length <= 0) {
      index += 1;
    }

    this.code[this.currentFunction?.headerLoc as number] += ` (result ${funcReturnType.convertType()})`;
    this.code[(this.currentFunction?.headerLoc as number) + index] += ` (result ${funcReturnType.convertType()})`;
    (this.currentFunction as FunctionDef).returnValue = funcReturnType.convertType();

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

  getAccess(prev: [Variable, AST], access: AST): AST {
    const prevVar = prev[0];
    const prevAST = prev[1];

    const isAssignment = access.kind === ASTTypes.Assign;
    const isBinary = access.kind === ASTTypes.Binary;

    let accessor = access;
    if (isAssignment || isBinary) {
      accessor = access.left;
    }

    // TODO: FIX CUSTOM TYPES!
    let prevType;
    if (!(prevType = this.classes[prevVar.dataType.toString()])) {
      new DimeError("Cannot access property!", accessor.value.pos, []);
    }

    let accessName = accessor.value.value;
    if (accessor.isSubscript) {
      if (accessor.kind === ASTTypes.Identifier) {
        accessName = "";
        const id = this.compileIdentifier(accessor);

        if (id.dataType.toString() == "str") {
          new DimeError("Cannot use subscript with strings!", accessor.value.pos, []);
        } else if (id.dataType.toString() == "i32") {
          this.code.push(`\t\ti32.add`);

          if (!isAssignment) {
            this.code.push(`\t\ti32.load`);
          } else {
            this.compile(access.right);
            this.code.push(`\t\ti32.store`);
          }
        }
      }
    }

    if (accessName) {
      // console.log(accessName, prevType);
      let prop;
      if (!prevType.properties.hasOwnProperty(accessName)) {
        if (!prevType.hasMethod(accessName)) {
          new DimeError("Property does not exist!", accessor.value.pos, []);
        }

        if (accessor.kind !== ASTTypes.FunctionCall) {
          new DimeError("You currently cannot access functions as properties!", accessor.value.pos, []);
        }

        const func = prevType.methods.functions[accessName];
        
        for (let arg of accessor.args) {
          this.compile(arg)
        }

        this.code.push(`\t\tcall \$${func.name}`);

        return access;
      } else {
        prop = prevType.properties[accessName]
      }

      if (prop instanceof DimeClass) {};
      
      if (prop instanceof Variable) {
        // local.get variable
        this.code.push(`\t\ti32.const ${prop.index}`);
        this.code.push(`\t\ti32.add`);

        if (!isAssignment) {
          this.code.push(`\t\ti32.load`);
        } else {
          this.compile(access.right);
          this.code.push(`\t\ti32.store`);
        }

        if (accessor.access) {
          return this.getAccess([prop, accessor], accessor.access);
        }
      }
    }

    return access;
  }

  compileIdentifier(node: AST): AST {
    if (!this.currentFunction)
      new DimeError("TODO: Cannot create global variables! Tried using variable '%v.'", node.value.pos, [node.value]);

    const func = this.currentFunction as FunctionDef;

    const varName = node.value.value;

    if (!func.variables.hasVariable(varName)) {
      new DimeError("Variable %v is not defined. Tried using variable that was not defined.", node.value.pos, [node.value]);
    }

    const variable = func.variables.getVariable(varName);
    this.code.push(`\t\tlocal.get \$${variable.name}`);

    if (node.access) {
      return this.getAccess([variable, node], node.access);
    }

    return node;
  }

  compileAssign(node: AST) {
    if (!this.currentFunction)
      new DimeError("TODO: Cannot create global variables! Tried creating variable %v.", node.value.pos, [node.value]);
    
    const { left, right } = node;
    const func = this.currentFunction as FunctionDef;

    // console.log(node, left);

    const varName = left.value.value;
    const varType = this.getRType(left);
    const varTypeStr = varType.convertType();

    const op = node.value.value;

    let notDefiners = ["++", "--", "+=", "-=", "*=", "%="];

    if (left.kind === ASTTypes.Variable && func.variables.hasVariable(varName) && !notDefiners.includes(op)) {
      new DimeError("Variable %v is already defined. Variables can only have one definition.", left.value.pos, [left.value]);
    } else if (left.kind === ASTTypes.Variable && !notDefiners.includes(op)) {
      func.variables.addVariable(varName, left);
    }

    let rType = this.getRType(right);
    if (!rType) {
      switch (op) {
        case "--":
        case "++":
          rType = new Type(new Token(TokenTypes.Datatype, "i32")); // weird ik
          break;
      }
    }

    let rTypeStr = rType.convertType();

    if (!varType.compareTo(rType))
      new DimeError(`Cannot assign a '${rTypeStr}' to '${varTypeStr}' on variable %v. Type mismatch.`, right.value.pos, [left.value])

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
    const varType = node.dataType.convertType();

    func.variables.addVariable(varName, node);
    let pos = this.currentFunction?.headerLoc as number;
    let newVar = [`\t\t(local \$${varName} ${varType})`];

    this.code = this.code.slice(0, pos + 1).concat(newVar).concat(this.code.slice(pos + 1));

    // this.code.push(`\t\t(local \$${varName} ${wasmType})`);
  }

  getRType(node: AST): Type {
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

    if (!lDataType.compareTo(rDataType))
      new DimeError("Cannot perform operation. Type mismatch.", op.pos, [op]);

    const binType = lDataType.convertType();
    
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
      const argType = this.getRType(arg).convertType();

      funcParamList += ` (param ${argType})`;
    }

    if (dataType || this.getRType(assign).convertType() != "void") {
      const argType = this.getRType(assign).convertType();

      if (argType != "void")
        funcReturnType = ` (result ${argType})`;
    }

    this.codeTop.push(`\t(import "std" "${token.value}" (func \$${token.value}${funcParamList}${funcReturnType}))`);
  }

  compileClass(node: AST) {
    const dimeClass = new DimeClass(node);
    this.classes[dimeClass.name] = dimeClass;

    for (const exp of node.block) {
      if (exp.kind === ASTTypes.Property) {
        const varName = exp.value.value;
        
        const propsLength = Object.keys(dimeClass.properties).length;
        dimeClass.addProperty(varName, new Variable(varName, propsLength, exp.dataType));
      } else if (exp.kind === ASTTypes.Function) {
        this.compile(exp);
      } else {
        new DimeError("Classes may only contain properties and methods!", exp.value.pos, []);
      }
    }

    // this.customTypes[dimeClass.name] = dimeClass.dataType;
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

      case ASTTypes.Class:
        this.compileClass(node);
        return "Class";

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