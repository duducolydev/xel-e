const base = require("@xel-e/config/eslint-base");

module.exports = [
  ...base,
  {
    rules: {
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
];
