# 標準 MIDI ファイルを読む小さな部品 (外部ライブラリなし)。単体で動かすと JSON に書き出す
import sys, struct, json
def vlq(d,i):
    v=0
    while True:
        b=d[i]; i+=1; v=(v<<7)|(b&0x7f)
        if b<0x80: return v,i
def parse(path):
    d=open(path,'rb').read()
    assert d[:4]==b'MThd'
    fmt,ntr,div=struct.unpack('>HHH',d[8:14])
    i=14; tracks=[]; tempos=[]
    for t in range(ntr):
        assert d[i:i+4]==b'MTrk'; ln=struct.unpack('>I',d[i+4:i+8])[0]; j=i+8; end=j+ln; i=end
        tick=0; run=None; on={}; notes=[]
        while j<end:
            dt,j=vlq(d,j); tick+=dt
            b=d[j]
            if b==0xff:
                typ=d[j+1]; l,k=vlq(d,j+2); data=d[k:k+l]; j=k+l
                if typ==0x51: tempos.append((tick,int.from_bytes(data,'big')))
                continue
            if b in (0xf0,0xf7):
                l,k=vlq(d,j+1); j=k+l; continue
            if b&0x80: run=b; j+=1
            st=run&0xf0
            if st in (0xc0,0xd0): j+=1; continue
            a,v=d[j],d[j+1]; j+=2
            if st==0x90 and v>0: on.setdefault(a,[]).append((tick,v))
            elif st==0x80 or (st==0x90 and v==0):
                if on.get(a): s,vv=on[a].pop(0); notes.append((s,tick-s,a,vv))
        tracks.append(sorted(notes))
    return div,tempos,tracks
if __name__=="__main__":
  div,tempos,tracks=parse(sys.argv[1])
  print(div,tempos[:5],[len(t) for t in tracks],file=sys.stderr)
  json.dump({'div':div,'tempos':tempos,'tracks':tracks},open(sys.argv[2],'w'))
