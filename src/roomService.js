import {
  arrayUnion, doc, onSnapshot, runTransaction, serverTimestamp,
  setDoc, updateDoc
} from "firebase/firestore";
import { db } from "./firebase.js";

const rooms = "rooms";
export const cleanName = n => String(n||"").trim().replace(/\s+/g," ").slice(0,24);

function code() {
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
}

export async function createRoom({uid,name,image}) {
  for(let i=0;i<10;i++){
    const id=code(), ref=doc(db,rooms,id);
    try {
      await runTransaction(db,async tx=>{
        if((await tx.get(ref)).exists()) throw new Error("ROOM_EXISTS");
        tx.set(ref,{
          code:id, ownerId:uid, ownerName:name,
          image:image||{type:"default",src:"/mandala-1.svg"},
          strokes:[], users:[{uid,name}],
          createdAt:serverTimestamp(),updatedAt:serverTimestamp()
        });
      });
      return id;
    } catch(e) { if(e.message!=="ROOM_EXISTS") throw e; }
  }
  throw new Error("ROOM_CREATE_FAILED");
}

export async function joinRoom({code:roomCode,uid,name}) {
  const id=String(roomCode||"").trim().toUpperCase(), ref=doc(db,rooms,id);
  await runTransaction(db,async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists()) throw new Error("ROOM_NOT_FOUND");
    const room=snap.data(), users=room.users||[];
    const taken=users.some(u=>u.uid!==uid && u.name?.toLocaleLowerCase("tr-TR")===name.toLocaleLowerCase("tr-TR"));
    if(taken) throw new Error("NAME_TAKEN");
    tx.update(ref,{users:[...users.filter(u=>u.uid!==uid),{uid,name}],updatedAt:serverTimestamp()});
  });
  return id;
}

export async function leaveRoom(id,uid){
  const ref=doc(db,rooms,id);
  await runTransaction(db,async tx=>{
    const s=await tx.get(ref); if(!s.exists()) return;
    tx.update(ref,{users:(s.data().users||[]).filter(u=>u.uid!==uid),updatedAt:serverTimestamp()});
  });
}

export function subscribeRoom(id,cb){ return onSnapshot(doc(db,rooms,id),s=>cb(s.exists()?{id:s.id,...s.data()}:null)); }

export async function saveStrokes(id,strokes){
  await updateDoc(doc(db,rooms,id),{strokes,updatedAt:serverTimestamp()});
}
