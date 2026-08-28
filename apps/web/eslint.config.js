const base = require("@xel-e/config/eslint-base");

module.exports = [
  ...base,
  {
    ignores: [".next/**", "next-env.d.ts"],
  },
];
