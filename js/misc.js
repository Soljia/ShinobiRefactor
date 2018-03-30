var moment = require('moment');
var crypto = require('crypto');

module.exports = function (vars) {
    let s = vars ? vars['s'] : null
    let config = vars ? vars['config'] : null
    let io = vars ? vars['io'] : null
    let module = {};
    module.checkRelativePath=function(x){
        if(x.charAt(0)!=='/'){
            x=__dirname+'/'+x
        }
        return x
    }
    module.checkCorrectPathEnding=function(x){
        var length=x.length
        if(x.charAt(length-1)!=='/'){
            x=x+'/'
        }
        return x.replace('__DIR__',__dirname)
    }
    module.md5=function(x){return crypto.createHash('md5').update(x).digest("hex");}
    //send data to detector plugic n
    module.ocvTx=function(data){
        if(!s.ocv){return}
        if(s.ocv.isClientPlugin===true){
            tx(data,s.ocv.id)
        }else{
            s.connectedPlugins[s.ocv.plug].tx(data)
        }
    }
    //send data to socket client function
    module.tx=function(z,y,x){
        if(x){
            return x.broadcast.to(y).emit('f',z)
        };
        if(io)
            io.to(y).emit('f',z);
    }
    //send data to child node function (experimental)
    module.cx = function(z,y,x){
        if(x){
            return x.broadcast.to(y).emit('c',z)};
            io.to(y).emit('c',z);
        }
    module.txWithSubPermissions=function(z,y,permissionChoices){
        if(typeof permissionChoices==='string'){
            permissionChoices=[permissionChoices]
        }
        if(s.group[z.ke]){
            Object.keys(s.group[z.ke].users).forEach(function(v){
                var user = s.group[z.ke].users[v]
                if(user.details.sub){
                    if(user.details.allmonitors!=='1'){
                        var valid=0
                        var checked=permissionChoices.length
                        permissionChoices.forEach(function(b){
                            if(user.details[b].indexOf(z.mid)!==-1){
                                ++valid
                            }
                        })
                        if(valid===checked){
                        tx(z,user.cnid)
                        }
                    }else{
                        tx(z,user.cnid)
                    }
                }else{
                    tx(z,user.cnid)
                }
            })
        }
    }
    //load camera controller vars
    module.nameToTime=function(x){x=x.split('.')[0].split('T'),x[1]=x[1].replace(/-/g,':');x=x.join(' ');return x;}
    module.ratio=function(width,height,ratio){ratio = width / height;return ( Math.abs( ratio - 4 / 3 ) < Math.abs( ratio - 16 / 9 ) ) ? '4:3' : '16:9';}
    module.randomNumber=function(x){
        if(!x){x=10};
        return Math.floor((Math.random() * x) + 1);
    };
    module.gid=function(x){
        if(!x){x=10};var t = "";var p = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for( var i=0; i < x; i++ )
            t += p.charAt(Math.floor(Math.random() * p.length));
        return t;
    };
    module.nid=function(x){
        if(!x){x=6};var t = "";var p = "0123456789";
        for( var i=0; i < x; i++ )
            t += p.charAt(Math.floor(Math.random() * p.length));
        return t;
    };
    module.moment_withOffset=function(e,x){
        if(!e){e=new Date};if(!x){x='YYYY-MM-DDTHH-mm-ss'};
        e=moment(e);if(config.utcOffset){e=e.utcOffset(config.utcOffset)}
        return e.format(x);
    }
    module.moment=function(e,x){
        if(!e){e=new Date};if(!x){x='YYYY-MM-DDTHH-mm-ss'};
        return moment(e).format(x);
    }
    module.ipRange=function(start_ip, end_ip) {         
        var start_long = s.toLong(start_ip);
        var end_long = s.toLong(end_ip);
        if (start_long > end_long) {
            var tmp=start_long;
            start_long=end_long
            end_long=tmp;
        }
        var range_array = [];
        var i;
        for (i=start_long; i<=end_long;i++) {
            range_array.push(s.fromLong(i));
        }
        return range_array;
    }
    module.portRange=function(lowEnd,highEnd){
        var list = [];
        for (var i = lowEnd; i <= highEnd; i++) {
            list.push(i);
        }
        return list;
    }
    //toLong taken from NPM package 'ip'
    module.toLong=function(ip) {
        var ipl = 0;
        ip.split('.').forEach(function(octet) {
            ipl <<= 8;
            ipl += parseInt(octet);
        });
        return(ipl >>> 0);
    };
    //fromLong taken from NPM package 'ip'
    module.fromLong=function(ipl) {
        return ((ipl >>> 24) + '.' +
            (ipl >> 16 & 255) + '.' +
            (ipl >> 8 & 255) + '.' +
            (ipl & 255) );
    };
    module.createPamDiffRegionArray = function(regions,globalSensitivity,fullFrame){
        var pamDiffCompliantArray = [],
            arrayForOtherStuff = [],
            json
        try{
            json = JSON.parse(regions)
        }catch(err){
            json = regions
        }
        if(fullFrame){
            json[fullFrame.name]=fullFrame;
        }
        Object.values(json).forEach(function(region){
            region.polygon = [];
            region.points.forEach(function(points){
                region.polygon.push({x:parseFloat(points[0]),y:parseFloat(points[1])})
            })
            if(region.sensitivity===''){
                region.sensitivity = globalSensitivity
            }else{
                region.sensitivity = parseInt(region.sensitivity)
            }
            pamDiffCompliantArray.push({name: region.name, difference: 9, percent: region.sensitivity, polygon:region.polygon})
            arrayForOtherStuff[region.name] = region;
        })
        if(pamDiffCompliantArray.length===0){pamDiffCompliantArray = null}
        return {forPam:pamDiffCompliantArray,notForPam:arrayForOtherStuff};
    }
    module.getRequest = function(url,callback){
        return http.get(url, function(res){
            var body = '';
            res.on('data', function(chunk){
                body += chunk;
            });
            res.on('end',function(){
                try{body = JSON.parse(body)}catch(err){}
                callback(body)
            });
        }).on('error', function(e){
    //                              s.systemLog("Get Snapshot Error", e);
        });
    }
    module.kill=function(x,group,id){
        let mon = group.mon[id];
        if(mon&&mon&&mon.spawn !== undefined){
            if(mon.spawn){
                mon.spawn.stdio[3].unpipe();
                if(mon.p2p){mon.p2p.unpipe();}
                delete(mon.p2p)
                delete(mon.pamDiff)
                try{
                mon.spawn.removeListener('end',mon.spawn_exit);
                mon.spawn.removeListener('exit',mon.spawn_exit);
                delete(mon.spawn_exit);
                }catch(er){}
            }
            clearTimeout(mon.checker);
            delete(mon.checker);
            clearTimeout(mon.checkStream);
            delete(mon.checkStream);
            clearTimeout(mon.watchdog_stop);
            delete(mon.watchdog_stop);
            if(e&&mon.record){
                clearTimeout(mon.record.capturing);
                //if(s.group[e.ke].mon[e.id].record.request){s.group[e.ke].mon[e.id].record.request.abort();delete(s.group[e.ke].mon[e.id].record.request);}
            };
            if(mon.child_node){
                cx({f:'kill',d:s.init('noReference',e)},mon.child_node_id)
            }else{
                if(!x||x===1){return};
                p=x.pid;
                if(group.mon_conf[id].type===('dashcam'||'socket'||'jpeg'||'pipe')){
                    x.stdin.pause();setTimeout(function(){x.kill('SIGTERM');delete(x);},500)
                }else{
                    try{
                        x.stdin.setEncoding('utf8');x.stdin.write('q');
                    }catch(er){}
                }
                setTimeout(function(){exec('kill -9 '+p,{detached: true})},1000)
            }
        }
    }
    //user log
    module.log=function(e,x){
        if(!x||!e.mid){return}
        if((e.details&&e.details.sqllog==='1')||e.mid.indexOf('$')>-1){
            s.sqlQuery('INSERT INTO Logs (ke,mid,info) VALUES (?,?,?)',[e.ke,e.mid,s.s(x)]);
        }
        tx({f:'log',ke:e.ke,mid:e.mid,log:x,time:moment()},'GRPLOG_'+e.ke);
    //    s.systemLog('s.log : ',{f:'log',ke:e.ke,mid:e.mid,log:x,time:moment()},'GRP_'+e.ke)
    }
    //system log
    module.systemLog=function(q,w,e){
        if(!w){w=''}
        if(!e){e=''}
        if(config.systemLog===true){
            if(typeof q==='string'&&s.databaseEngine){
                s.sqlQuery('INSERT INTO Logs (ke,mid,info) VALUES (?,?,?)',['$','$SYSTEM',s.s({type:q,msg:w})]);
                tx({f:'log',log:{time:moment(),ke:'$',mid:'$SYSTEM',time:moment(),info:s.s({type:q,msg:w})}},'$');
            }
            return console.log(moment().format(),q,w,e)
        }
    }
    return module;
}