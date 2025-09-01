import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
   // files: ["**/*.{js,cjs}"], 
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.browser },
    rules: {
   // "no-undef": "error",        // ⚠ catch undefined vars/functions
//  "no-unused-vars": "warn"    // optional, for unused variables
    },
  },
  {
    files: ["**/*.js"],
    languageOptions: { sourceType: "commonjs" }
  },
]);
