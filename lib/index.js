"use strict";

const chalk = require("chalk");

console.log(chalk.gray("\n──────────────────────────────────────────────────"));
console.log(chalk.magentaBright.bold("        Baileys Mod by AlwaysZakzz "));
console.log(chalk.whiteBright("  Hi, thank you for using my modified Baileys ^_^"));
console.log(chalk.gray("──────────────────────────────────────────────────"));

// Info Body
console.log(chalk.cyan(" 📢 Telegram : ") + chalk.blueBright("https://t.me/AlwaysZakzz"));
console.log(chalk.cyan(" 🚀 GitHub   : ") + chalk.blueBright("https://github.com/ZakzzBotz"));

const latestUpdate = new Date("2026-1-05");
console.log(chalk.yellowBright(" 📅 Updated  : ") + chalk.whiteBright(latestUpdate.toLocaleDateString()));

// Pembatas Bawah
console.log(chalk.gray("──────────────────────────────────────────────────\n"));

var createBinding =
  (this && this.createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);

        if (
          !desc ||
          (!("get" in desc) && (desc.writable || desc.configurable))
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }

        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });

var exportStar =
  (this && this.exportStar) ||
  function (m, exports) {
    for (var p in m)
      if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p))
        createBinding(exports, m, p);
  };

var importDefault =
  (this && this.importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };

Object.defineProperty(exports, "__esModule", { value: true });

const Socket_1 = importDefault(require("./Socket"));

exports.makeWASocket = Socket_1.default;

exportStar(require("../WAProto"), exports);
exportStar(require("./Utils"), exports);
exportStar(require("./Types"), exports);
exportStar(require("./Store"), exports);
exportStar(require("./Defaults"), exports);
exportStar(require("./WABinary"), exports);
exportStar(require("./WAM"), exports);
exportStar(require("./WAUSync"), exports);

exports.default = Socket_1.default;
