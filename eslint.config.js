const tseslint = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");

module.exports = [
    {
        files: ["src/**/*.ts", "webviewsrc/**/*.ts"],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 6,
                sourceType: "module"
            }
        },
        plugins: {
            "@typescript-eslint": tseslint
        },
        rules: {
            "curly": "error",
            "eqeqeq": "error",
            "no-throw-literal": "error",
            "semi": "error",
            "quotes": ["error", "single", { "avoidEscape": true, "allowTemplateLiterals": true }],
            "sort-imports": ["error", { "ignoreCase": true, "ignoreDeclarationSort": true }],
        }
    }
];
