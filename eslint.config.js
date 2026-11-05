import unusedImports from "eslint-plugin-unused-imports";

export default [
  {
    ignores: [
      "dist/**",
      "out/**",
      ".agents/**",
      "node_modules/**",
      "scratch/**",
    ],
  },
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
];
