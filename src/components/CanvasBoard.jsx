import {useEffect,useRef,useState} from "react";
import {buildRegionMap,regionIdAt,BOUNDARY_ID} from "../utils/regionMap.js";
import {stampSegment,hexToRgb} from "../utils/brush.js";

const color="#ef476f",size=18;
const id=()=>Date.now()+"-"+Math.random().toString(36).slice(2,9);

export default function CanvasBoard({imageSrc,initialStrokes,onStrokes}){
 const v=useRef(),line=useRef(),paint=useRef(),region=useRef(),data=useRef(),drawing=useRef(null);
 const [ready,setReady]=useState(false),[strokes,setStrokes]=useState(initialStrokes||[]),[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0});
 useEffect(()=>setStrokes(initialStrokes||[]),[initialStrokes]);
 useEffect(()=>{let stop=false;const img=new Image();img.onload=()=>{if(stop)return;const w=img.naturalWidth,h=img.naturalHeight,l=line.current,c=paint.current;l.width=c.width=w;l.height=c.height=h;const flat=document.createElement("canvas");flat.width=w;flat.height=h;const fc=flat.getContext("2d",{willReadFrequently:true});fc.fillStyle="#fff";fc.fillRect(0,0,w,h);fc.drawImage(img,0,0,w,h);region.current=buildRegionMap(fc.getImageData(0,0,w,h));l.getContext("2d").drawImage(img,0,0,w,h);data.current=c.getContext("2d",{willReadFrequently:true}).getImageData(0,0,w,h);redraw(initialStrokes||[]);setReady(true)};img.src=imageSrc;return()=>{stop=true}},[imageSrc]);
 useEffect(()=>{if(ready)redraw(initialStrokes||[])},[ready,initialStrokes]);
 function redraw(list){if(!data.current)return;data.current.data.fill(0);for(const s of list||[]){const p=s.points||[],rgb=hexToRgb(s.color||color);for(let i=1;i<p.length;i++)stampSegment(data.current,region.current,p[i-1].x,p[i-1].y,p[i].x,p[i].y,s.size||size,s.regionId,rgb,1);if(p.length===1)stampSegment(data.current,region.current,p[0].x,p[0].y,p[0].x,p[0].y,s.size||size,s.regionId,rgb,1)}paint.current.getContext("2d").putImageData(data.current,0,0)}
 function pos(e){const r=v.current.getBoundingClientRect();return{x:(e.clientX-r.left-pan.x)/zoom,y:(e.clientY-r.top-pan.y)/zoom}}
 function down(e){if(!ready||e.button!==0)return;const p=pos(e),rid=regionIdAt(region.current,p.x,p.y);if(rid<=0||rid===BOUNDARY_ID)return;drawing.current={id:id(),regionId:rid,color,size,points:[p],last:p};setStrokes(x=>[...x,drawing.current]);e.currentTarget.setPointerCapture(e.pointerId)}
 function move(e){const s=drawing.current;if(!s)return;const p=pos(e);if(regionIdAt(region.current,p.x,p.y)!==s.regionId)return;stampSegment(data.current,region.current,s.last.x,s.last.y,p.x,p.y,size,s.regionId,hexToRgb(color),1);s.points.push(p);s.last=p;paint.current.getContext("2d").putImageData(data.current,0,0)}
 function up(){if(!drawing.current)return;drawing.current=null;onStrokes?.(strokes)}
 function undo(){const n=strokes.slice(0,-1);setStrokes(n);redraw(n);onStrokes?.(n)}
 function clear(){setStrokes([]);redraw([]);onStrokes?.([])}
 function wheel(e){e.preventDefault();setZoom(z=>Math.max(.5,Math.min(5,z*Math.exp(-e.deltaY*.0015))))}
 return <div ref={v} className="canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}><div className="stage" style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`}}><canvas ref={paint}/><canvas ref={line}/></div><div className="tools"><button onClick={()=>setZoom(z=>Math.min(5,z*1.25))}>＋</button><button onClick={()=>setZoom(z=>Math.max(.5,z/1.25))}>−</button><button onClick={()=>{setZoom(1);setPan({x:0,y:0})}}>1:1</button><button onClick={undo}>Geri al</button><button onClick={clear}>Temizle</button></div>{!ready&&<div className="loading">Çizim hazırlanıyor…</div>}</div>
}
