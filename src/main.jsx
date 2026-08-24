import React,{useEffect,useRef,useState} from "react";
import {ensureAnonymousAuth} from "./firebase.js";
import {cleanName,createRoom,joinRoom,leaveRoom,saveStrokes,subscribeRoom} from "./roomService.js";
import CanvasBoard from "./components/CanvasBoard.jsx";
import "./styles.css";

const DEFAULT={type:"default",src:"/mandala-1.svg"};

export default function App(){
 const [uid,setUid]=useState(null),[name,setName]=useState(localStorage.getItem("boyama_name")||"");
 const [screen,setScreen]=useState("name"),[code,setCode]=useState(""),[join,setJoin]=useState("");
 const [room,setRoom]=useState(null),[error,setError]=useState(""),[loading,setLoading]=useState(false);
 const [file,setFile]=useState(null),unsub=useRef(null);

 useEffect(()=>{ensureAnonymousAuth().then(u=>setUid(u.uid)).catch(()=>setError("Firebase bağlantısı kurulamadı."));return()=>unsub.current?.()},[]);
 function nameOK(){const n=cleanName(name);if(n.length<2){setError("En az 2 karakterlik isim gir.");return null}localStorage.setItem("boyama_name",n);setError("");return n}
 async function create(){
  const n=nameOK();if(!n||!uid)return;setLoading(true);
  try{const image=file?{type:"uploaded",name:file.name,dataUrl:await dataUrl(file)}:DEFAULT;const id=await createRoom({uid,name:n,image});enter(id)}
  catch(e){setError(msg(e))}finally{setLoading(false)}
 }
 async function enterRoom(){
  const n=nameOK();if(!n||!uid)return;setLoading(true);
  try{const id=await joinRoom({code:join,uid,name:n});enter(id)}catch(e){setError(msg(e))}finally{setLoading(false)}
 }
 function enter(id){unsub.current?.();unsub.current=subscribeRoom(id,r=>{if(!r){setError("Oda bulunamadı.");setScreen("home");return}setRoom(r);setCode(id)});setScreen("room")}
 async function leave(){if(uid&&code)await leaveRoom(code,uid).catch(()=>{});unsub.current?.();setRoom(null);setScreen("home")}
 async function upload(e){const f=e.target.files?.[0];if(!f)return;if(!f.type.startsWith("image/"))return setError("Görsel seç.");if(f.size>2*1024*1024)return setError("Fotoğraf 2 MB'dan küçük olmalı.");setFile(f)}
 if(screen==="name")return <Shell><Card><h1>Mandala Boyama</h1><p>Bir isim seç, birlikte boyamaya başlayalım.</p><input autoFocus value={name} maxLength={24} placeholder="İsmin" onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(nameOK()&&setScreen("home"))}/><Err t={error}/><button className="primary" onClick={()=>nameOK()&&setScreen("home")}>Devam et</button><Footer/></Card></Shell>;
 if(screen==="home")return <Shell><Card><h1>Mandala Boyama</h1><p>Merhaba, {cleanName(name)} 👋</p><button className="primary" disabled={loading} onClick={create}>{loading?"Oluşturuluyor…":"Yeni Oda Oluştur"}</button><div className="or">veya</div><input value={join} maxLength={6} placeholder="Oda kodu" onChange={e=>setJoin(e.target.value.toUpperCase())}/><button disabled={loading||join.length!==6} onClick={enterRoom}>Odaya Katıl</button><label className="upload">{file?file.name:"Fotoğraf yükle (isteğe bağlı)"}<input type="file" accept="image/*" onChange={upload}/></label><Err t={error}/><Footer/></Card></Shell>;
 return <div className="room"><header><b>Oda {code}</b><span>{room?.users?.length||0} kişi</span><div><button onClick={()=>navigator.clipboard?.writeText(location.origin+location.pathname+"?room="+code)}>Davet linki</button><button onClick={leave}>Çık</button></div></header><CanvasBoard imageSrc={room?.image?.dataUrl||room?.image?.src||DEFAULT.src} initialStrokes={room?.strokes||[]} onStrokes={s=>saveStrokes(code,s)}/></div>
}
function Shell({children}){return <main className="shell">{children}</main>} function Card({children}){return <section className="card">{children}</section>} function Err({t}){return t?<div className="error">{t}</div>:null} function Footer(){return <footer>Made in — Esonun hayranı</footer>}
function dataUrl(f){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)})}
function msg(e){return e.message==="NAME_TAKEN"?"Bu isim bu odada zaten kullanılıyor.":e.message==="ROOM_NOT_FOUND"?"Bu oda bulunamadı.":"Bir hata oluştu. Tekrar dene."}
import ReactDOM from "react-dom/client";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);