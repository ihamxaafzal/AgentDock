import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchStaticObjects,batchRigidPart } from '../public/batching.js';

test('robot part batching preserves colors and the parent joint still moves independently',()=>{
 const arm=new THREE.Group(),shell=new THREE.MeshStandardMaterial({color:'#754a91'}),hand=new THREE.MeshStandardMaterial({color:'#eee8fa'});
 const upper=new THREE.Mesh(new THREE.BoxGeometry(.2,.4,.2),shell),lower=new THREE.Mesh(new THREE.BoxGeometry(.2,.15,.2),hand);lower.position.y=-.4;arm.add(upper,lower);
 const [merged]=batchRigidPart(arm,shell,{});assert.equal(arm.children.length,1);assert(merged.geometry.attributes.color);assert.equal(merged.userData.shellRanges.length,1);
 const colors=merged.geometry.attributes.color;assert.notEqual(colors.getX(0),colors.getX(colors.count-1));arm.rotation.x=1.2;assert.equal(arm.rotation.x,1.2);assert(merged.geometry.boundingBox.min.y<-.4);
});

test('static batching preserves transformed bounds and vertex attributes', () => {
  const parent = new THREE.Group(), material = new THREE.MeshBasicMaterial();
  const a = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  const b = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material); b.position.x = 4;
  parent.add(a, b);
  const [batched] = batchStaticObjects([...parent.children], parent);
  assert.equal(parent.children.length, 1);
  assert.equal(batched.geometry.boundingBox.min.x, -1);
  assert.equal(batched.geometry.boundingBox.max.x, 5);
  assert.equal(batched.geometry.attributes.position.count, 48);
  assert.equal(batched.geometry.attributes.normal.count, 48);
  assert.equal(batched.geometry.attributes.uv.count, 48);
  assert.equal(batched.geometry.index.count, 72);
  assert.equal(batched.material, material);
});
test('world batching preserves parent offsets and does not mix materials', () => {
  const root = new THREE.Group(), left = new THREE.Group(), right = new THREE.Group(), output = new THREE.Group();
  left.position.x = 10; right.position.x = -10; root.add(left, right, output);
  const material = new THREE.MeshBasicMaterial();
  const a = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  const b = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  const separate = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  left.add(a, separate); right.add(b);
  const result = batchStaticObjects([a, b, separate], output, { world: true });
  assert.equal(result.length, 1); assert.equal(result[0].geometry.boundingBox.min.x, -11); assert.equal(result[0].geometry.boundingBox.max.x, 11);
  assert.equal(separate.parent, left);
});
test('independent line pairs remain independent segments', () => {
  const parent = new THREE.Group(), material = new THREE.LineBasicMaterial();
  for (const x of [0, 4]) parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, 0), new THREE.Vector3(x + 1, 0, 0)]), material));
  const [batched] = batchStaticObjects([...parent.children], parent);
  assert.equal(batched.isLineSegments, true); assert.equal(batched.geometry.attributes.position.count, 4);
});
