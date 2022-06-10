class CliArg {
  index: number;
  key: string;
  value: string;

  constructor(index: number, key: string, value?: string) {
    this.index = index;
    this.key = key;
    this.value = value ?? key;
  }
};

class CliArgList {
  args: CliArg[];

  constructor(args: CliArg[]) {
    this.args = args ?? [];
  }

  findArgByValue(value: string): CliArg | null {
    for (let i = 0; i < this.args.length; i++) {
      let arg = this.args[i];
      
      if (arg.value == value)
        return arg;
    }

    return null;
  }

  findArgByKey(key: string): CliArg | null {
    for (let i = 0; i < this.args.length; i++) {
      let arg = this.args[i];
      
      if (arg.value == key)
        return arg;
    }

    return null;
  }

  findArgWithParam(key: string, params: number): [CliArg, CliArg[]] | null {
    const arg = this.findArgByKey(key);
    if (!arg)
      return null;

    const paramList = [];

    let lastArg = arg;
    for (let i = 0; i < params; i++) {
      const newArg = this.getNextArg(lastArg);
      if (!newArg)
        break;

      lastArg = newArg;
      paramList.push(lastArg);
    }

    return [arg, paramList];
  }

  hasArg(key: string): boolean {
    return this.findArgByKey(key) != null;
  }

  getNextArg(arg: CliArg): CliArg | null {
    if (this.args.length < arg.index + 1)
      return null;

    return this.args[arg.index + 1];
  }

  static parse(args: string[]) {
    let argList: CliArg[] = [];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.includes("=")) {
        const [key, value] = arg.split("=");
        argList.push(new CliArg(i, key, value));
        continue;
      }

      argList.push(new CliArg(i, args[i]));
    }

    return new CliArgList(argList);
  }
};

export function parseArgs(args: string[]) {
  return CliArgList.parse(args);
}