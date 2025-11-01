// insecure.js
var x = 1; // preferați const/let
function handler(req, res) {
  const id = req.query.id; // nesanitizat
  eval("console.log('hi')"); // eval = red flag
  res.end("ok " + id);
}

// slow-sync.js
const fs = require('fs');
function readFileSyncInRequest(req, res) {
  const data = fs.readFileSync('/etc/hosts', 'utf8'); // blocking I/O
  res.end(data);
}

// async-errors.js
async function risky() {
  const r = await fetch('https://example.com'); // fără try/catch
  return r.text();
}

// style.js
function veryLongFunctionNameThatDoesTooManyThingsAndIsHardToRead(paramOne, paramTwo, paramThree) {
  // fără comentarii
  const a = paramOne + paramTwo + paramThree; // logică complexă
  return a;
}

// test.js
function add(a, b) {
  return a + b;
}
// lipsesc testele unitare pentru funcția add