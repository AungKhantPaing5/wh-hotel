import {test} from "node:test";
import assert from "node:assert/strict";
import { validateLocalUrl, configurePrivateTest, runtime, photoAddress } from "../src/runtime";
test("private test addresses reject public endpoints, spoofed DNS names, credentials and invalid protocols", () => {
  for (const value of ["https://payapi.uk", "http://payapi.uk", "http://192.168.evil.example", "http://10.evil.example", "http://172.16.evil.example", "http://user:secret@192.168.1.5", "http://8.8.8.8", "ftp://10.0.0.1"]) {
    assert.throws(() => validateLocalUrl(value));
  }
  assert.equal(validateLocalUrl("http://192.168.1.5:3001/api/"),"http://192.168.1.5:3001/api");
  assert.equal(validateLocalUrl("http://10.0.2.2:9099"),"http://10.0.2.2:9099");
});
test("uploaded photos resolve against the hotel origin and preserve external HTTPS URLs",()=>{
  assert.equal(photoAddress("/api/photos/sample.webp","https://payapi.uk/api"),"https://payapi.uk/api/photos/sample.webp");
  assert.equal(photoAddress("https://images.example/room.webp","https://payapi.uk/api"),"https://images.example/room.webp");
});
test("test configuration is validated before being used",()=>{
  const prior={...runtime};
  configurePrivateTest("http://192.168.1.5:3001/api","http://192.168.1.5:9099");
  assert.equal(runtime.localTest,true);
  Object.assign(runtime,prior);
});
