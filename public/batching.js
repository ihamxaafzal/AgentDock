import * as THREE from 'three';

/** Merge each rigid robot part with baked colors; joints remain independent. */
export function batchRigidPart(parent,shell,materials){
 const output=[];
 const groups=new Map();
 for(const mesh of parent.children.filter(o=>o.isMesh&&o.visible&&o.material&&!o.material.map&&!o.material.transparent)){
  const m=mesh.material;if(!m.isMeshStandardMaterial&&!m.isMeshBasicMaterial)continue;
  const kind=m.isMeshBasicMaterial?'basic':`standard:${m.roughness}:${m.metalness}`;
  if(!groups.has(kind))groups.set(kind,[]);groups.get(kind).push(mesh);
 }
 for(const [kind,meshes] of groups){
  if(meshes.length<2)continue;
  if(!materials[kind]){const source=meshes[0].material;materials[kind]=kind==='basic'?new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false}):new THREE.MeshStandardMaterial({vertexColors:true,roughness:source.roughness,metalness:source.metalness});materials[kind].userData.shared=true;}
  let offset=0;const ranges=[];
  for(const mesh of meshes){const count=mesh.geometry.attributes.position.count,color=mesh.material.color,values=new Float32Array(count*3);for(let i=0;i<count;i++){values[i*3]=color.r;values[i*3+1]=color.g;values[i*3+2]=color.b;}mesh.geometry.setAttribute('color',new THREE.BufferAttribute(values,3));if(mesh.material===shell)ranges.push([offset,count]);offset+=count;mesh.material=materials[kind];}
  for(const merged of batchStaticObjects(meshes,parent)){merged.userData.shellRanges=ranges;output.push(merged);}
 }
 return output;
}

/** Bake compatible static objects into fewer draws, retaining their materials. */
export function batchStaticObjects(objects, parent, { world = false } = {}) {
  const groups = new Map();
  for (const object of objects) {
    if (!object.geometry || !object.material || Array.isArray(object.material) || object.isInstancedMesh) continue;
    const line = object.isLineSegments || object.isLine && object.geometry.attributes.position.count === 2;
    if (!object.isMesh && !line) continue;
    const attributes = Object.entries(object.geometry.attributes).map(([k, a]) => `${k}:${a.itemSize}:${a.array.constructor.name}:${a.normalized}`).sort().join('|');
    const key = `${line ? 'line' : 'mesh'}:${object.material.id}:${attributes}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(object);
  }
  const merged = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sources = group.map(o => {
      if (world) o.updateWorldMatrix(true, false); else o.updateMatrix();
      const g = o.geometry.clone();
      g.applyMatrix4(world ? o.matrixWorld : o.matrix);
      return g;
    });
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(sources[0].attributes)) {
      const count = sources.reduce((n, g) => n + g.attributes[name].array.length, 0);
      const array = new attribute.array.constructor(count); let offset = 0;
      for (const source of sources) { array.set(source.attributes[name].array, offset); offset += source.attributes[name].array.length; }
      geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
    }
    const vertexCount = geometry.attributes.position.count;
    const indexCount = sources.reduce((n, g) => n + (g.index?.count || g.attributes.position.count), 0);
    const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
    let indexOffset = 0, vertexOffset = 0;
    for (const source of sources) {
      const count = source.index?.count || source.attributes.position.count;
      for (let i = 0; i < count; i++) indices[indexOffset++] = vertexOffset + (source.index ? source.index.array[i] : i);
      vertexOffset += source.attributes.position.count;
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const first = group[0];
    const object = first.isLine ? new THREE.LineSegments(geometry, first.material) : new THREE.Mesh(geometry, first.material);
    object.name = 'batched-static'; parent.add(object); merged.push(object);
    for (const old of group) { old.removeFromParent(); old.geometry.dispose(); }
    sources.forEach(g => g.dispose());
  }
  return merged;
}
