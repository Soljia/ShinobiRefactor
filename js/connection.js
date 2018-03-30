var moment = require('moment');
var os = require('os');
var http = require('http');
var https = require('https');

module.exports = function(vars){
    let s = vars['s']
    let config = vars['config']
    let logging = vars['logging']
    let misc = vars['misc']
    let camera = vars['camera']
    let lang = vars['lang'];
    let module = {};
    module.init = function (cn) {
        var tx;
            //set "client" detector plugin event function
            cn.on('ocv',function(d){
                if(!cn.pluginEngine&&d.f==='init'){
                    if(config.pluginKeys[d.plug]===d.pluginKey){
                        s.pluginInitiatorSuccess("client",d,cn)
                    }else{
                        s.pluginInitiatorFail("client",d,cn)
                    }
                }else{
                    if(config.pluginKeys[d.plug]===d.pluginKey){
                        s.pluginEventController(d)
                    }else{
                        cn.disconnect()
                    }
                }
            })
            //unique FLV socket stream
            cn.on('FLV',function(d){
                if(!s.group[d.ke]||!s.group[d.ke].mon||!s.group[d.ke].mon[d.id]){
                    cn.disconnect();return;
                }
                cn.ip=cn.request.connection.remoteAddress;
                var toUTC = function(){
                    return new Date().toISOString();
                }
                var tx=function(z){cn.emit('data',z);}
                d.failed=function(msg){
                    tx({f:'stop_reconnect',msg:msg,token_used:d.auth,ke:d.ke});
                    cn.disconnect();
                }
                d.success=function(r){
                    r=r[0];
                    var Emitter,chunkChannel
                    if(!d.channel){
                        Emitter = s.group[d.ke].mon[d.id].emitter
                        chunkChannel = 'MAIN'
                    }else{
                        Emitter = s.group[d.ke].mon[d.id].emitterChannel[parseInt(d.channel)+config.pipeAddition]
                        chunkChannel = parseInt(d.channel)+config.pipeAddition
                    }
                    if(!Emitter){
                        cn.disconnect();return;
                    }
                    if(!d.channel)d.channel = 'MAIN';
                    cn.ke=d.ke,
                    cn.uid=d.uid,
                    cn.auth=d.auth;
                    cn.channel=d.channel;
                    cn.removeListenerOnDisconnect=true;
                    cn.socketVideoStream=d.id;
                    tx({time:toUTC(),buffer:s.group[d.ke].mon[d.id].firstStreamChunk[chunkChannel]})
                    Emitter.on('data',s.group[d.ke].mon[d.id].contentWriter[chunkChannel]=function(buffer){
                        tx({time:toUTC(),buffer:buffer})
                    })
                 }
                s.sqlQuery('SELECT ke,uid,auth,mail,details FROM Users WHERE ke=? AND auth=? AND uid=?',[d.ke,d.auth,d.uid],function(err,r) {
                    if(r&&r[0]){
                        d.success(r)
                    }else{
                        s.sqlQuery('SELECT * FROM API WHERE ke=? AND code=? AND uid=?',[d.ke,d.auth,d.uid],function(err,r) {
                            if(r&&r[0]){
                                r=r[0]
                                r.details=JSON.parse(r.details)
                                if(r.details.auth_socket==='1'){
                                    s.sqlQuery('SELECT ke,uid,auth,mail,details FROM Users WHERE ke=? AND uid=?',[r.ke,r.uid],function(err,r) {
                                        if(r&&r[0]){
                                            d.success(r)
                                        }else{
                                            d.failed('User not found')
                                        }
                                    })
                                }else{
                                    d.failed('Permissions for this key do not allow authentication with Websocket')
                                }
                            }else{
                                d.failed('Not an API key')
                            }
                        })
                    }
                })
            })
            //unique MP4 socket stream
            cn.on('MP4',function(d){
                if(!s.group[d.ke]||!s.group[d.ke].mon||!s.group[d.ke].mon[d.id]){
                    cn.disconnect();return;
                }
                cn.ip=cn.request.connection.remoteAddress;
                var toUTC = function(){
                    return new Date().toISOString();
                }
                var tx=function(z){cn.emit('data',z);}
                d.failed=function(msg){
                    tx({f:'stop_reconnect',msg:msg,token_used:d.auth,ke:d.ke});
                    cn.disconnect();
                }
                d.success=function(r){
                    r=r[0];
                    var Emitter,chunkChannel
                    if(!d.channel){
                        Emitter = s.group[d.ke].mon[d.id].emitter
                        chunkChannel = 'MAIN'
                    }else{
                        Emitter = s.group[d.ke].mon[d.id].emitterChannel[parseInt(d.channel)+config.pipeAddition]
                        chunkChannel = parseInt(d.channel)+config.pipeAddition
                    }
                    if(!Emitter){
                        cn.disconnect();return;
                    }
                    if(!d.channel)d.channel = 'MAIN';
                    cn.ke=d.ke,
                    cn.uid=d.uid,
                    cn.auth=d.auth;
                    cn.channel=d.channel;
                    cn.socketVideoStream=d.id;
                    var mp4frag = s.group[d.ke].mon[d.id].mp4frag[d.channel];
                    var onInitialized = () => {
                        cn.emit('mime', mp4frag.mime);
                        mp4frag.removeListener('initialized', onInitialized);
                    };
        
                    //event listener
                    var onSegment = function(data){
                        cn.emit('segment', data);
                    };
                    cn.on('MP4Command',function(msg){
                        switch (msg) {
                            case 'mime' ://client is requesting mime
                                var mime = mp4frag.mime;
                                if (mime) {
                                    cn.emit('mime', mime);
                                } else {
                                    mp4frag.on('initialized', onInitialized);
                                }
                            break;
                            case 'initialization' ://client is requesting initialization segment
                                cn.emit('initialization', mp4frag.initialization);
                            break;
                            case 'segment' ://client is requesting a SINGLE segment
                                var segment = mp4frag.segment;
                                if (segment) {
                                    cn.emit('segment', segment);
                                } else {
                                    mp4frag.once('segment', onSegment);
                                }
                            break;
                            case 'segments' ://client is requesting ALL segments
                                //send current segment first to start video asap
                                var segment = mp4frag.segment;
                                if (segment) {
                                    cn.emit('segment', segment);
                                }
                                //add listener for segments being dispatched by mp4frag
                                mp4frag.on('segment', onSegment);
                            break;
                            case 'pause' :
                                mp4frag.removeListener('segment', onSegment);
                            break;
                            case 'resume' :
                                mp4frag.on('segment', onSegment);
                            break;
                            case 'stop' ://client requesting to stop receiving segments
                                mp4frag.removeListener('segment', onSegment);
                                mp4frag.removeListener('initialized', onInitialized);
                            break;
                        }
                    })
                }
                s.sqlQuery('SELECT ke,uid,auth,mail,details FROM Users WHERE ke=? AND auth=? AND uid=?',[d.ke,d.auth,d.uid],function(err,r) {
                    if(r&&r[0]){
                        d.success(r)
                    }else{
                        s.sqlQuery('SELECT * FROM API WHERE ke=? AND code=? AND uid=?',[d.ke,d.auth,d.uid],function(err,r) {
                            if(r&&r[0]){
                                r=r[0]
                                r.details=JSON.parse(r.details)
                                if(r.details.auth_socket==='1'){
                                    s.sqlQuery('SELECT ke,uid,auth,mail,details FROM Users WHERE ke=? AND uid=?',[r.ke,r.uid],function(err,r) {
                                        if(r&&r[0]){
                                            d.success(r)
                                        }else{
                                            d.failed('User not found')
                                        }
                                    })
                                }else{
                                    d.failed('Permissions for this key do not allow authentication with Websocket')
                                }
                            }else{
                                d.failed('Not an API key')
                            }
                        })
                    }
                })
            })
            //main socket control functions
            cn.on('f',function(d){
                if(!cn.ke&&d.f==='init'){//socket login
                    cn.ip=cn.request.connection.remoteAddress;
                    tx=function(z){if(!z.ke){z.ke=cn.ke;};cn.emit('f',z);}
                    d.failed=function(){tx({ok:false,msg:'Not Authorized',token_used:d.auth,ke:d.ke});cn.disconnect();}
                    d.success=function(r){
                        r=r[0];cn.join('GRP_'+d.ke);cn.join('CPU');
                        cn.ke=d.ke,
                        cn.uid=d.uid,
                        cn.auth=d.auth;
                        if(!s.group[d.ke])s.group[d.ke]={};
        //                    if(!s.group[d.ke].vid)s.group[d.ke].vid={};
                        if(!s.group[d.ke].users)s.group[d.ke].users={};
        //                    s.group[d.ke].vid[cn.id]={uid:d.uid};
                        s.group[d.ke].users[d.auth]={cnid:cn.id,uid:r.uid,mail:r.mail,details:JSON.parse(r.details),logged_in_at:moment(new Date).format(),login_type:'Dashboard'}
                        try{s.group[d.ke].users[d.auth].details=JSON.parse(r.details)}catch(er){}
                        if(s.group[d.ke].users[d.auth].details.get_server_log!=='0'){
                            cn.join('GRPLOG_'+d.ke)
                        }
                        s.group[d.ke].users[d.auth].lang=s.getLanguageFile(s.group[d.ke].users[d.auth].details.lang)
                        logging.log({ke:d.ke,mid:'$USER'},{type:s.group[d.ke].users[d.auth].lang['Websocket Connected'],msg:{mail:r.mail,id:d.uid,ip:cn.ip}})
                        if(!s.group[d.ke].mon){
                            s.group[d.ke].mon={}
                            if(!s.group[d.ke].mon){s.group[d.ke].mon={}}
                        }
                        if(s.ocv){
                            tx({f:'detector_plugged',plug:s.ocv.plug,notice:s.ocv.notice})
                            misc.ocvTx({f:'readPlugins',ke:d.ke})
                        }
                        tx({f:'users_online',users:s.group[d.ke].users})
                        misc.tx({f:'user_status_change',ke:d.ke,uid:cn.uid,status:1,user:s.group[d.ke].users[d.auth]},'GRP_'+d.ke)
                        s.init('diskUsedEmit',d)
                        s.init('apps',d)
                        s.sqlQuery('SELECT * FROM API WHERE ke=? AND uid=?',[d.ke,d.uid],function(err,rrr) {
                            tx({
                                f:'init_success',
                                users:s.group[d.ke].vid,
                                apis:rrr,
                                os:{
                                    platform:s.platform,
                                    cpuCount:os.cpus().length,
                                    totalmem:s.totalmem
                                }
                            })
                            http.get('http://'+config.ip+':'+config.port+'/'+cn.auth+'/monitor/'+cn.ke, function(res){
                                var body = '';
                                res.on('data', function(chunk){
                                    body += chunk;
                                });
                                res.on('end', function(){
                                    var rr = JSON.parse(body);
                                    setTimeout(function(g){
                                        g=function(t){
                                            camera.camera('snapshot',{mid:t.mid,ke:t.ke,mon:t})
                                        }
                                        if(rr.mid){
                                            g(rr)
                                        }else{
                                            rr.forEach(g)
                                        }
                                    },2000)
                                });
                            }).on('error', function(e){
        //                              logging.systemLog("Get Snapshot Error", e);
                            });
                        })
                    }
                    s.sqlQuery('SELECT ke,uid,auth,mail,details FROM Users WHERE ke=? AND auth=? AND uid=?',[d.ke,d.auth,d.uid],function(err,r) {
                        if(r&&r[0]){
                            d.success(r)
                        }else{
                            s.sqlQuery('SELECT * FROM API WHERE ke=? AND code=? AND uid=?',[d.ke,d.auth,d.uid],function(err,r) {
                                if(r&&r[0]){
                                    r=r[0]
                                    r.details=JSON.parse(r.details)
                                    if(r.details.auth_socket==='1'){
                                        s.sqlQuery('SELECT ke,uid,auth,mail,details FROM Users WHERE ke=? AND uid=?',[r.ke,r.uid],function(err,r) {
                                            if(r&&r[0]){
                                                d.success(r)
                                            }else{
                                                d.failed()
                                            }
                                        })
                                    }else{
                                        d.failed()
                                    }
                                }else{
                                    d.failed()
                                }
                            })
                        }
                    })
                    return;
                }
                if((d.id||d.uid||d.mid)&&cn.ke){
                    try{
                    switch(d.f){
                        case'ocv_in':
                            misc.ocvTx(d.data)
                        break;
                        case'monitorOrder':
                            if(d.monitorOrder&&d.monitorOrder instanceof Array){
                                s.sqlQuery('SELECT details FROM Users WHERE uid=? AND ke=?',[cn.uid,cn.ke],function(err,r){
                                    if(r&&r[0]){
                                        r=JSON.parse(r[0].details);
                                        r.monitorOrder=d.monitorOrder;
                                        s.sqlQuery('UPDATE Users SET details=? WHERE uid=? AND ke=?',[JSON.stringify(r),cn.uid,cn.ke])
                                    }
                                })
                            }
                        break;
                        case'update':
                            if(!config.updateKey){
                                tx({error:lang.updateKeyText1});
                                return;
                            }
                            if(d.key===config.updateKey){
                                exec('chmod +x '+__dirname+'/UPDATE.sh&&'+__dirname+'/UPDATE.sh',{detached: true})
                            }else{
                                tx({error:lang.updateKeyText2});
                            }
                        break;
                        case'cron':
                            if(s.group[cn.ke]&&s.group[cn.ke].users[cn.auth].details&&!s.group[cn.ke].users[cn.auth].details.sub){
                                misc.tx({f:d.ff},s.cron.id)
                            }
                        break;
                        case'api':
                            switch(d.ff){
                                case'delete':
                                    d.set=[],d.ar=[];
                                    d.form.ke=cn.ke;d.form.uid=cn.uid;delete(d.form.ip);
                                    if(!d.form.code){tx({f:'form_incomplete',form:'APIs'});return}
                                    d.for=Object.keys(d.form);
                                    d.for.forEach(function(v){
                                        d.set.push(v+'=?'),d.ar.push(d.form[v]);
                                    });
                                    s.sqlQuery('DELETE FROM API WHERE '+d.set.join(' AND '),d.ar,function(err,r){
                                        if(!err){
                                            tx({f:'api_key_deleted',form:d.form});
                                            delete(s.api[d.form.code]);
                                        }else{
                                            logging.systemLog('API Delete Error : '+e.ke+' : '+' : '+e.mid,err)
                                        }
                                    })
                                break;
                                case'add':
                                    d.set=[],d.qu=[],d.ar=[];
                                    d.form.ke=cn.ke,d.form.uid=cn.uid,d.form.code=misc.gid(30);
                                    d.for=Object.keys(d.form);
                                    d.for.forEach(function(v){
                                        d.set.push(v),d.qu.push('?'),d.ar.push(d.form[v]);
                                    });
                                    s.sqlQuery('INSERT INTO API ('+d.set.join(',')+') VALUES ('+d.qu.join(',')+')',d.ar,function(err,r){
                                        d.form.time=misc.moment(new Date,'YYYY-DD-MM HH:mm:ss');
                                        if(!err){tx({f:'api_key_added',form:d.form});}else{logging.systemLog(err)}
                                    });
                                break;
                            }
                        break;
                        case'settings':
                            switch(d.ff){
                                case'filters':
                                    switch(d.fff){
                                        case'save':case'delete':
                                            s.sqlQuery('SELECT details FROM Users WHERE ke=? AND uid=?',[d.ke,d.uid],function(err,r){
                                                if(r&&r[0]){
                                                    r=r[0];
                                                    d.d=JSON.parse(r.details);
                                                    if(d.form.id===''){d.form.id=misc.gid(5)}
                                                    if(!d.d.filters)d.d.filters={};
                                                    //save/modify or delete
                                                    if(d.fff==='save'){
                                                        d.d.filters[d.form.id]=d.form;
                                                    }else{
                                                        delete(d.d.filters[d.form.id]);
                                                    }
                                                    s.sqlQuery('UPDATE Users SET details=? WHERE ke=? AND uid=?',[JSON.stringify(d.d),d.ke,d.uid],function(err,r){
                                                        tx({f:'filters_change',uid:d.uid,ke:d.ke,filters:d.d.filters});
                                                    });
                                                }
                                            })
                                        break;
                                    }
                                break;
                                case'edit':
                                    s.sqlQuery('SELECT details FROM Users WHERE ke=? AND uid=?',[d.ke,d.uid],function(err,r){
                                        if(r&&r[0]){
                                            r=r[0];
                                            d.d=JSON.parse(r.details);
                                            if(d.d.get_server_log==='1'){
                                                cn.join('GRPLOG_'+d.ke)
                                            }else{
                                                cn.leave('GRPLOG_'+d.ke)
                                            }
                                            ///unchangeable from client side, so reset them in case they did.
                                            d.form.details=JSON.parse(d.form.details)
                                            //admin permissions
                                            d.form.details.permissions=d.d.permissions
                                            d.form.details.edit_size=d.d.edit_size
                                            d.form.details.edit_days=d.d.edit_days
                                            d.form.details.use_admin=d.d.use_admin
                                            d.form.details.use_webdav=d.d.use_webdav
                                            d.form.details.use_ldap=d.d.use_ldap
                                            //check
                                            if(d.d.edit_days=="0"){
                                                d.form.details.days=d.d.days;
                                            }
                                            if(d.d.edit_size=="0"){
                                                d.form.details.size=d.d.size;
                                            }
                                            if(d.d.sub){
                                                d.form.details.sub=d.d.sub;
                                                if(d.d.monitors){d.form.details.monitors=d.d.monitors;}
                                                if(d.d.allmonitors){d.form.details.allmonitors=d.d.allmonitors;}
                                                if(d.d.video_delete){d.form.details.video_delete=d.d.video_delete;}
                                                if(d.d.video_view){d.form.details.video_view=d.d.video_view;}
                                                if(d.d.monitor_edit){d.form.details.monitor_edit=d.d.monitor_edit;}
                                                if(d.d.size){d.form.details.size=d.d.size;}
                                                if(d.d.days){d.form.details.days=d.d.days;}
                                                delete(d.form.details.mon_groups)
                                            }
                                            var newSize = d.form.details.size
                                            d.form.details=JSON.stringify(d.form.details)
                                            ///
                                            d.set=[],d.ar=[];
                                            if(d.form.pass&&d.form.pass!==''){d.form.pass=misc.md5(d.form.pass);}else{delete(d.form.pass)};
                                            delete(d.form.password_again);
                                            d.for=Object.keys(d.form);
                                            d.for.forEach(function(v){
                                                d.set.push(v+'=?'),d.ar.push(d.form[v]);
                                            });
                                            d.ar.push(d.ke),d.ar.push(d.uid);
                                            s.sqlQuery('UPDATE Users SET '+d.set.join(',')+' WHERE ke=? AND uid=?',d.ar,function(err,r){
                                                if(!d.d.sub){
                                                    s.group[d.ke].sizeLimit = parseFloat(newSize)
                                                    delete(s.group[d.ke].webdav)
                                                    s.init('apps',d)
                                                }
                                                tx({f:'user_settings_change',uid:d.uid,ke:d.ke,form:d.form});
                                            });
                                        }
                                    })
                                break;
                            }
                        break;
                        case'monitor':
                            switch(d.ff){
                                case'get':
                                    switch(d.fff){
                                        case'videos&events':
                                            if(!d.eventLimit){
                                                d.eventLimit=500
                                            }else{
                                                d.eventLimit = parseInt(d.eventLimit);
                                            }
                                            if(!d.eventStartDate&&d.startDate){
                                                d.eventStartDate=d.startDate
                                            }
                                            if(!d.eventEndDate&&d.endDate){
                                                d.eventEndDate=d.endDate
                                            }
                                            var monitorQuery = ''
                                            var monitorValues = []
                                            var permissions = s.group[d.ke].users[cn.auth].details;
                                            if(!d.mid){
                                                if(permissions.sub&&permissions.monitors&&permissions.allmonitors!=='1'){
                                                    try{permissions.monitors=JSON.parse(permissions.monitors);}catch(er){}
                                                    var or = [];
                                                    permissions.monitors.forEach(function(v,n){
                                                        or.push('mid=?');
                                                        monitorValues.push(v)
                                                    })
                                                    monitorQuery += ' AND ('+or.join(' OR ')+')'
                                                }
                                            }else if(!permissions.sub||permissions.allmonitors!=='0'||permissions.monitors.indexOf(d.mid)>-1){
                                                monitorQuery += ' and mid=?';
                                                monitorValues.push(d.mid)
                                            }
                                            var getEvents = function(callback){
                                                var eventQuery = 'SELECT * FROM Events WHERE ke=?';
                                                var eventQueryValues = [cn.ke];
                                                if(d.eventStartDate&&d.eventStartDate!==''){
                                                    d.eventStartDate=d.eventStartDate.replace('T',' ')
                                                    if(d.eventEndDate&&d.eventEndDate!==''){
                                                        d.eventEndDate=d.eventEndDate.replace('T',' ')
                                                        eventQuery+=' AND `time` >= ? AND `time` <= ?';
                                                        eventQueryValues.push(decodeURIComponent(d.eventStartDate))
                                                        eventQueryValues.push(decodeURIComponent(d.eventEndDate))
                                                    }else{
                                                        eventQuery+=' AND `time` >= ?';
                                                        eventQueryValues.push(decodeURIComponent(d.eventStartDate))
                                                    }
                                                }
                                                if(monitorValues.length>0){
                                                    eventQuery += monitorQuery;
                                                    eventQueryValues = eventQueryValues.concat(monitorValues);
                                                }
                                                eventQuery+=' ORDER BY `time` DESC LIMIT '+d.eventLimit+'';
                                                s.sqlQuery(eventQuery,eventQueryValues,function(err,r){
                                                    if(err){
                                                        console.log(eventQuery)
                                                        console.error('LINE 2428',err)
                                                        setTimeout(function(){
                                                            getEvents(callback)
                                                        },2000)
                                                    }else{
                                                        if(!r){r=[]}
                                                        r.forEach(function(v,n){
                                                            r[n].details=JSON.parse(v.details);
                                                        })
                                                        callback(r)
                                                    }
                                                })
                                            }
                                            if(!d.videoLimit&&d.limit){
                                                d.videoLimit=d.limit
                                                eventQuery.push()
                                            }
                                            if(!d.videoStartDate&&d.startDate){
                                                d.videoStartDate=d.startDate
                                            }
                                            if(!d.videoEndDate&&d.endDate){
                                                d.videoEndDate=d.endDate
                                            }
                                             var getVideos = function(callback){
                                                var videoQuery='SELECT * FROM Videos WHERE ke=?';
                                                var videoQueryValues=[cn.ke];
                                                if(d.videoStartDate||d.videoEndDate){
                                                    if(!d.videoStartDateOperator||d.videoStartDateOperator==''){
                                                        d.videoStartDateOperator='>='
                                                    }
                                                    if(!d.videoEndDateOperator||d.videoEndDateOperator==''){
                                                        d.videoEndDateOperator='<='
                                                    }
                                                    switch(true){
                                                        case(d.videoStartDate&&d.videoStartDate!==''&&d.videoEndDate&&d.videoEndDate!==''):
                                                            d.videoStartDate=d.videoStartDate.replace('T',' ')
                                                            d.videoEndDate=d.videoEndDate.replace('T',' ')
                                                            videoQuery+=' AND `time` '+d.videoStartDateOperator+' ? AND `end` '+d.videoEndDateOperator+' ?';
                                                            videoQueryValues.push(d.videoStartDate)
                                                            videoQueryValues.push(d.videoEndDate)
                                                        break;
                                                        case(d.videoStartDate&&d.videoStartDate!==''):
                                                            d.videoStartDate=d.videoStartDate.replace('T',' ')
                                                            videoQuery+=' AND `time` '+d.videoStartDateOperator+' ?';
                                                            videoQueryValues.push(d.videoStartDate)
                                                        break;
                                                        case(d.videoEndDate&&d.videoEndDate!==''):
                                                            d.videoEndDate=d.videoEndDate.replace('T',' ')
                                                            videoQuery+=' AND `end` '+d.videoEndDateOperator+' ?';
                                                            videoQueryValues.push(d.videoEndDate)
                                                        break;
                                                    }
                                                }
                                                if(monitorValues.length>0){
                                                    videoQuery += monitorQuery;
                                                    videoQueryValues = videoQueryValues.concat(monitorValues);
                                                }
                                                videoQuery+=' ORDER BY `time` DESC';
                                                if(!d.videoLimit||d.videoLimit==''){
                                                    d.videoLimit='100'
                                                }
                                                if(d.videoLimit!=='0'){
                                                    videoQuery+=' LIMIT '+d.videoLimit
                                                }
                                                s.sqlQuery(videoQuery,videoQueryValues,function(err,r){
                                                    if(err){
                                                        console.log(videoQuery)
                                                        console.error('LINE 2416',err)
                                                        setTimeout(function(){
                                                            getVideos(callback)
                                                        },2000)
                                                    }else{
                                                        r.forEach(function(v){
                                                            v.href='/'+cn.auth+'/videos/'+v.ke+'/'+v.mid+'/'+misc.moment(v.time)+'.'+v.ext;
                                                        })
                                                        callback({total:r.length,limit:d.videoLimit,videos:r})
                                                    }
                                                })
                                            }
                                            getVideos(function(videos){
                                                getEvents(function(events){
                                                    tx({
                                                        f:'drawPowerVideoMainTimeLine',
                                                        videos:videos,
                                                        events:events
                                                    })
                                                })
                                            })
                                        break;
                                    }
                                break;
                                case'control':
                                    camera.camera('control',d,function(resp){
                                        tx({f:'control',response:resp})
                                    })
                                break;
                                case'jpeg_off':
                                  delete(cn.jpeg_on);
                                    if(cn.monitor_watching){
                                      Object.keys(cn.monitor_watching).forEach(function(n,v){
                                          v=cn.monitor_watching[n];
                                          cn.join('MON_STREAM_'+n);
                                      });
                                    }
                                    tx({f:'mode_jpeg_off'})
                                break;
                                case'jpeg_on':
                                  cn.jpeg_on=true;
                                    if(cn.monitor_watching){
                                  Object.keys(cn.monitor_watching).forEach(function(n,v){
                                      v=cn.monitor_watching[n];
                                      cn.leave('MON_STREAM_'+n);
                                  });
                                    }
                                  tx({f:'mode_jpeg_on'})
                                break;
                                case'watch_on':
                                    if(!d.ke){d.ke=cn.ke}
                                    s.init(0,{mid:d.id,ke:d.ke});
                                    if(!s.group[d.ke]||!s.group[d.ke].mon[d.id]||s.group[d.ke].mon[d.id].started===0){return false}
                                    camera.camera(d.ff,d,cn,tx)
                                    cn.join('MON_'+d.id);
                                    cn.join('DETECTOR_'+d.ke+d.id);
                                    if(cn.jpeg_on!==true){
                                        cn.join('MON_STREAM_'+d.id);
                                    } if(s.group[d.ke]&&s.group[d.ke].mon&&s.group[d.ke].mon[d.id]&&s.group[d.ke].mon[d.id].watch){
        
                                        tx({f:'monitor_watch_on',id:d.id,ke:d.ke})
                                        misc.tx({viewers:Object.keys(s.group[d.ke].mon[d.id].watch).length,ke:d.ke,id:d.id},'MON_'+d.id)
                                   }
                                break;
                                case'watch_off':
                                    if(!d.ke){
                                        d.ke=cn.ke;
                                    };
                                    cn.leave('MON_'+d.id);
                                    camera.camera(d.ff,d,cn,tx);
                                    misc.tx("Start");
                                    misc.tx({viewers:d.ob,ke:d.ke,id:d.id},'MON_'+d.id)
                                    misc.tx("End");
                                break;
                                case'start':case'stop':
                            s.sqlQuery('SELECT * FROM Monitors WHERE ke=? AND mid=?',[cn.ke,d.id],function(err,r) {
                                if(r&&r[0]){r=r[0]
                                    camera.camera(d.ff,{type:r.type,url:s.init('url',r),id:d.id,mode:d.ff,ke:cn.ke});
                                }
                            })
                                break;
                            }
                        break;
        //                case'video':
        //                    switch(d.ff){
        //                        case'fix':
        //                            s.video('fix',d)
        //                        break;
        //                    }
        //                break;
                        case'ffprobe':
                            if(s.group[cn.ke].users[cn.auth]){
                                switch(d.ff){
                                    case'stop':
                                        exec('kill -9 '+s.group[cn.ke].users[cn.auth].ffprobe.pid,{detatched: true})
                                    break;
                                    default:
                                        if(s.group[cn.ke].users[cn.auth].ffprobe){
                                            return
                                        }
                                        s.group[cn.ke].users[cn.auth].ffprobe=1;
                                        tx({f:'ffprobe_start'})
                                        exec('ffprobe '+('-v quiet -print_format json -show_format -show_streams '+d.query),function(err,data){
                                            tx({f:'ffprobe_data',data:data.toString('utf8')})
                                            delete(s.group[cn.ke].users[cn.auth].ffprobe)
                                            tx({f:'ffprobe_stop'})
                                        })
                                        //auto kill in 30 seconds
                                        setTimeout(function(){
                                            exec('kill -9 '+d.pid,{detached: true})
                                        },30000)
                                    break;
                                }
                            }
                        break;
                        case'onvif':
                            d.ip=d.ip.replace(/ /g,'');
                            d.port=d.port.replace(/ /g,'');
                            if(d.ip===''){
                                var interfaces = os.networkInterfaces();
                                var addresses = [];
                                for (var k in interfaces) {
                                    for (var k2 in interfaces[k]) {
                                        var address = interfaces[k][k2];
                                        if (address.family === 'IPv4' && !address.internal) {
                                            addresses.push(address.address);
                                        }
                                    }
                                }
                                d.arr=[]
                                addresses.forEach(function(v){
                                    if(v.indexOf('0.0.0')>-1){return false}
                                    v=v.split('.');
                                    delete(v[3]);
                                    v=v.join('.');
                                    d.arr.push(v+'1-'+v+'254')
                                })
                                d.ip=d.arr.join(',')
                            }
                            if(d.port===''){
                                d.port='80,8080,8000,7575,8081,554'
                            }
                            d.ip.split(',').forEach(function(v){
                                if(v.indexOf('-')>-1){
                                    v=v.split('-');
                                    d.IP_RANGE_START = v[0],
                                    d.IP_RANGE_END = v[1];
                                }else{
                                    d.IP_RANGE_START = v;
                                    d.IP_RANGE_END = v;
                                }
                                if(!d.IP_LIST){
                                    d.IP_LIST = misc.ipRange(d.IP_RANGE_START,d.IP_RANGE_END);
                                }else{
                                    d.IP_LIST=d.IP_LIST.concat(misc.ipRange(d.IP_RANGE_START,d.IP_RANGE_END))
                                }
                                //check port
                                if(d.port.indexOf('-')>-1){
                                    d.port=d.port.split('-');
                                    d.PORT_RANGE_START = d.port[0];
                                    d.PORT_RANGE_END = d.port[1];
                                    d.PORT_LIST = misc.portRange(d.PORT_RANGE_START,d.PORT_RANGE_END);
                                }else{
                                    d.PORT_LIST=d.port.split(',')
                                }
                                //check user name and pass
                                d.USERNAME='';
                                if(d.user){
                                    d.USERNAME = d.user
                                }
                                d.PASSWORD='';
                                if(d.pass){
                                    d.PASSWORD = d.pass
                                }
                            })
                            d.cams=[]
                            d.IP_LIST.forEach(function(ip_entry,n) {
                                d.PORT_LIST.forEach(function(port_entry,nn) {
                                   new Cam({
                                        hostname: ip_entry,
                                        username: d.USERNAME,
                                        password: d.PASSWORD,
                                        port: port_entry,
                                        timeout : 5000
                                    }, function CamFunc(err,data) {
                                        if (err) return;
                                        data={f:'onvif',ip:ip_entry,port:port_entry}
                                        var cam_obj = this;
                                        cam_obj.getSystemDateAndTime(function(er, date, xml) {
                                            if (!er) data.date = date;
                                           cam_obj.getDeviceInformation(function(er, info, xml) {
                                                if (!er) data.info = info;
                                                try {
                                                    cam_obj.getStreamUri({
                                                        protocol: 'RTSP'
                                                    },function(er, stream, xml) {
                                                        if (!er) data.url = stream;
                                                        tx(data)
                                                    });
                                                }catch(err){
                                                    tx(data);
                                                }
                                           });
                                        });
                                    });
                                }); // foreach
                            }); // foreach
        //                    tx({f:'onvif_end'})
                        break;
                    }
                }catch(er){
                    logging.systemLog('ERROR CATCH 1',er)
                }
                }else{
                    tx({ok:false,msg:lang.NotAuthorizedText1});
                }
            });
            //functions for retrieving cron announcements
            cn.on('cron',function(d){
                if(d.f==='init'){
                    if(config.cron.key){
                        if(config.cron.key===d.cronKey){
                           s.cron={started:moment(),last_run:moment(),id:cn.id};
                        }else{
                            cn.disconnect()
                        }
                    }else{
                        s.cron={started:moment(),last_run:moment(),id:cn.id};
                    }
                }else{
                    if(s.cron&&cn.id===s.cron.id){
                        delete(d.cronKey)
                        switch(d.f){
                            case'filters':
                                s.filter(d.ff,d);
                            break;
                            case's.tx':
                                misc.tx(d.data,d.to)
                            break;
                            case's.video':
                                s.video(d.data,d.file)
                            break;
                            case'start':case'end':
                                d.mid='_cron';logging.log(d,{type:'cron',msg:d.msg})
                            break;
                            default:
                                logging.systemLog('CRON : ',d)
                            break;
                        }
                    }else{
                        cn.disconnect()
                    }
                }
            })
            // admin page socket functions
            cn.on('super',function(d){
                if(!cn.init&&d.f=='init'){
                    d.ok=s.superAuth({mail:d.mail,pass:d.pass},function(data){
                        cn.uid=d.mail
                        cn.join('$');
                        cn.ip=cn.request.connection.remoteAddress
                        logging.log({ke:'$',mid:'$USER'},{type:lang['Websocket Connected'],msg:{for:lang['Superuser'],id:cn.uid,ip:cn.ip}})
                        cn.init='super';
                        cn.mail=d.mail;
                        misc.tx({f:'init_success',mail:d.mail},cn.id);
                    })
                    if(d.ok===false){
                        cn.disconnect();
                    }
                }else{
                    if(cn.mail&&cn.init=='super'){
                        switch(d.f){
                            case'logs':
                                switch(d.ff){
                                    case'delete':
                                        s.sqlQuery('DELETE FROM Logs WHERE ke=?',[d.ke])
                                    break;
                                }
                            break;
                            case'system':
                                switch(d.ff){
                                    case'update':
                                        ffmpeg.kill()
                                        logging.systemLog('Shinobi ordered to update',{by:cn.mail,ip:cn.ip,distro:d.distro})
                                        var updateProcess = spawn('sh',(__dirname+'/UPDATE.sh '+d.distro).split(' '),{detached: true})
                                        updateProcess.stderr.on('data',function(data){
                                            logging.systemLog('Update Info',data.toString())
                                        })
                                        updateProcess.stdout.on('data',function(data){
                                            logging.systemLog('Update Info',data.toString())
                                        })
                                    break;
                                    case'restart':
                                        d.check=function(x){return d.target.indexOf(x)>-1}
                                        if(d.check('system')){
                                            logging.systemLog('Shinobi ordered to restart',{by:cn.mail,ip:cn.ip})
                                            ffmpeg.kill()
                                            exec('pm2 restart '+__dirname+'/camera.js')
                                        }
                                        if(d.check('cron')){
                                            logging.systemLog('Shinobi CRON ordered to restart',{by:cn.mail,ip:cn.ip})
                                            exec('pm2 restart '+__dirname+'/cron.js')
                                        }
                                        if(d.check('logs')){
                                            logging.systemLog('Flush PM2 Logs',{by:cn.mail,ip:cn.ip})
                                            exec('pm2 flush')
                                        }
                                    break;
                                    case'configure':
                                        logging.systemLog('conf.json Modified',{by:cn.mail,ip:cn.ip,old:jsonfile.readFileSync(location.config)})
                                        jsonfile.writeFile(location.config,d.data,{spaces: 2},function(){
                                            misc.tx({f:'save_configuration'},cn.id)
                                        })
                                    break;
                                }
                            break;
                            case'accounts':
                                switch(d.ff){
                                    case'register':
                                        if(d.form.mail!==''&&d.form.pass!==''){
                                            if(d.form.pass===d.form.password_again){
                                                s.sqlQuery('SELECT * FROM Users WHERE mail=?',[d.form.mail],function(err,r) {
                                                    if(r&&r[0]){
                                                        //found address already exists
                                                        d.msg='Email address is in use.';
                                                        misc.tx({f:'error',ff:'account_register',msg:d.msg},cn.id)
                                                    }else{
                                                        //create new
                                                        //user id
                                                        d.form.uid=misc.gid();
                                                        //check to see if custom key set
                                                        if(!d.form.ke||d.form.ke===''){
                                                            d.form.ke=misc.gid()
                                                        }
                                                        //write user to db
                                                        s.sqlQuery('INSERT INTO Users (ke,uid,mail,pass,details) VALUES (?,?,?,?,?)',[d.form.ke,d.form.uid,d.form.mail,misc.md5(d.form.pass),d.form.details])
                                                        misc.tx({f:'add_account',details:d.form.details,ke:d.form.ke,uid:d.form.uid,mail:d.form.mail},'$');
                                                        //init user
                                                        s.init('group',d.form)
                                                    }
                                                })
                                            }else{
                                                d.msg=lang["Passwords Don't Match"];
                                            }
                                        }else{
                                            d.msg=lang['Fields cannot be empty'];
                                        }
                                        if(d.msg){
                                            misc.tx({f:'error',ff:'account_register',msg:d.msg},cn.id)
                                        }
                                    break;
                                    case'edit':
                                        if(d.form.pass&&d.form.pass!==''){
                                           if(d.form.pass===d.form.password_again){
                                               d.form.pass=misc.md5(d.form.pass);
                                           }else{
                                               misc.tx({f:'error',ff:'account_edit',msg:lang["Passwords Don't Match"]},cn.id)
                                               return
                                           }
                                        }else{
                                            delete(d.form.pass);
                                        }
                                        delete(d.form.password_again);
                                        d.keys=Object.keys(d.form);
                                        d.set=[];
                                        d.values=[];
                                        d.keys.forEach(function(v,n){
                                            if(d.set==='ke'||d.set==='password_again'||!d.form[v]){return}
                                            d.set.push(v+'=?')
                                            d.values.push(d.form[v])
                                        })
                                        d.values.push(d.account.mail)
                                        s.sqlQuery('UPDATE Users SET '+d.set.join(',')+' WHERE mail=?',d.values,function(err,r) {
                                            if(err){
                                                misc.tx({f:'error',ff:'account_edit',msg:lang.AccountEditText1},cn.id)
                                                return
                                            }
                                            misc.tx({f:'edit_account',form:d.form,ke:d.account.ke,uid:d.account.uid},'$');
                                            delete(s.group[d.account.ke].init);
                                            s.init('apps',d.account)
                                        })
                                    break;
                                    case'delete':
                                        s.sqlQuery('DELETE FROM Users WHERE uid=? AND ke=? AND mail=?',[d.account.uid,d.account.ke,d.account.mail])
                                        s.sqlQuery('DELETE FROM API WHERE uid=? AND ke=?',[d.account.uid,d.account.ke])
                                        misc.tx({f:'delete_account',ke:d.account.ke,uid:d.account.uid,mail:d.account.mail},'$');
                                    break;
                                }
                            break;
                        }
                    }
                }
            })
            // admin page socket functions
            cn.on('a',function(d){
                if(!cn.init&&d.f=='init'){
                    s.sqlQuery('SELECT * FROM Users WHERE auth=? AND uid=?',[d.auth,d.uid],function(err,r){
                        if(r&&r[0]){
                            r=r[0];
                            if(!s.group[d.ke]){s.group[d.ke]={users:{}}}
                            if(!s.group[d.ke].users[d.auth]){s.group[d.ke].users[d.auth]={cnid:cn.id}}
                            try{s.group[d.ke].users[d.auth].details=JSON.parse(r.details)}catch(er){}
                            cn.join('ADM_'+d.ke);
                            cn.ke=d.ke;
                            cn.uid=d.uid;
                            cn.auth=d.auth;
                            cn.init='admin';
                        }else{
                            cn.disconnect();
                        }
                    })
                }else{
                    s.auth({auth:d.auth,ke:d.ke,id:d.id,ip:cn.request.connection.remoteAddress},function(user){
                        if(!user.details.sub){
                            switch(d.f){
                                case'accounts':
                                    switch(d.ff){
                                        case'edit':
                                            d.keys=Object.keys(d.form);
                                            d.condition=[];
                                            d.value=[];
                                            d.keys.forEach(function(v){
                                                d.condition.push(v+'=?')
                                                d.value.push(d.form[v])
                                            })
                                            d.value=d.value.concat([d.ke,d.$uid])
                                            s.sqlQuery("UPDATE Users SET "+d.condition.join(',')+" WHERE ke=? AND uid=?",d.value)
                                            misc.tx({f:'edit_sub_account',ke:d.ke,uid:d.$uid,mail:d.mail,form:d.form},'ADM_'+d.ke);
                                        break;
                                        case'delete':
                                            s.sqlQuery('DELETE FROM Users WHERE uid=? AND ke=? AND mail=?',[d.$uid,d.ke,d.mail])
                                            s.sqlQuery('DELETE FROM API WHERE uid=? AND ke=?',[d.$uid,d.ke])
                                            misc.tx({f:'delete_sub_account',ke:d.ke,uid:d.$uid,mail:d.mail},'ADM_'+d.ke);
                                        break;
                                    }
                                break;
                            }
                        }
                    })
                }
            })
            //functions for webcam recorder
            cn.on('r',function(d){
                if(!cn.ke&&d.f==='init'){
                    s.sqlQuery('SELECT ke,uid,auth,mail,details FROM Users WHERE ke=? AND auth=? AND uid=?',[d.ke,d.auth,d.uid],function(err,r) {
                        if(r&&r[0]){
                            r=r[0]
                            cn.ke=d.ke,cn.uid=d.uid,cn.auth=d.auth;
                            if(!s.group[d.ke])s.group[d.ke]={};
                            if(!s.group[d.ke].users)s.group[d.ke].users={};
                            s.group[d.ke].users[d.auth]={cnid:cn.id,uid:r.uid,mail:r.mail,details:JSON.parse(r.details),logged_in_at:moment(new Date).format(),login_type:'Streamer'}
                        }
                    })
                }else{
                    switch(d.f){
                        case'monitor_chunk':
                            if(!s.group[d.ke]||!s.group[d.ke].mon[d.mid]){return}
                            if(s.group[d.ke].mon[d.mid].started!==1){misc.tx({error:'Not Started'},cn.id);return false};
                            s.group[d.ke].mon[d.mid].spawn.stdin.write(new Buffer(d.chunk, "binary"));
                        break;
                        case'monitor_frame':
                            if(!s.group[d.ke]||!s.group[d.ke].mon[d.mid]){return}
                            if(s.group[d.ke].mon[d.mid].started!==1){misc.tx({error:'Not Started'},cn.id);return false};
                            s.group[d.ke].mon[d.mid].spawn.stdin.write(d.frame);
                        break;
                    }
                }
            })
            //functions for dispersing work to child servers;
            cn.on('c',function(d){
        //        if(!cn.ke&&d.socket_key===s.child_key){
                    if(!cn.shinobi_child&&d.f=='init'){
                        cn.ip=cn.request.connection.remoteAddress;
                        cn.name=d.u.name;
                        cn.shinobi_child=1;
                        tx=function(z){cn.emit('c',z);}
                        if(!s.child_nodes[cn.ip]){s.child_nodes[cn.ip]=d.u;};
                        s.child_nodes[cn.ip].cnid=cn.id;
                        s.child_nodes[cn.ip].cpu=0;
                        tx({f:'init_success',child_nodes:s.child_nodes});
                    }else{
                        if(d.f!=='s.tx'){logging.systemLog('CRON',d)};
                        switch(d.f){
                            case'cpu':
                                s.child_nodes[cn.ip].cpu=d.cpu;
                            break;
                            case'sql':
                                s.sqlQuery(d.query,d.values);
                            break;
                            case'camera':
                                camera.camera(d.mode,d.data)
                            break;
                            case's.tx':
                                misc.tx(d.data,d.to)
                            break;
                            case's.log':
                                logging.log(d.data,d.to)
                            break;
                            case'created_file':
                                if(d.details&&d.details.dir&&d.details.dir!==''){
                                    d.dir=misc.checkCorrectPathEnding(d.details.dir)+d.ke+'/'+d.id+'/'
                                }else{
                                    d.dir=s.dir.videos+d.ke+'/'+d.id+'/';
                                }
                                fs.writeFile(d.dir+d.filename,d.created_file,'binary',function (err,data) {
                                    if (err) {
                                        return console.error('created_file'+d.d.mid,err);
                                    }
                                   tx({f:'delete_file',file:d.filename,ke:d.d.ke,mid:d.d.mid}); misc.tx({f:'video_build_success',filename:s.group[d.d.ke].mon[d.d.mid].open+'.'+s.group[d.d.ke].mon[d.d.mid].open_ext,mid:d.d.mid,ke:d.d.ke,time:misc.nameToTime(s.group[d.d.ke].mon[d.d.mid].open),end:misc.moment(new Date,'YYYY-MM-DD HH:mm:ss')},'GRP_'+d.d.ke);
                                });
                            break;
                        }
                    }
        //        }
            })
            //embed functions
            cn.on('e', function (d) {
                tx=function(z){if(!z.ke){z.ke=cn.ke;};cn.emit('f',z);}
                switch(d.f){
                    case'init':
                            if(!s.group[d.ke]||!s.group[d.ke].mon[d.id]||s.group[d.ke].mon[d.id].started===0){return false}
                        s.auth({auth:d.auth,ke:d.ke,id:d.id,ip:cn.request.connection.remoteAddress},function(user){
                            cn.embedded=1;
                            cn.ke=d.ke;
                            if(!cn.mid){cn.mid={}}
                            cn.mid[d.id]={};
        //                    if(!s.group[d.ke].embed){s.group[d.ke].embed={}}
        //                    if(!s.group[d.ke].embed[d.mid]){s.group[d.ke].embed[d.mid]={}}
        //                    s.group[d.ke].embed[d.mid][cn.id]={}
        
                            camera.camera('watch_on',d,cn,tx)
                            cn.join('MON_'+d.id);
                            cn.join('MON_STREAM_'+d.id);
                            cn.join('DETECTOR_'+d.ke+d.id);
                            cn.join('STR_'+d.ke);
                            if(s.group[d.ke]&&s.group[d.ke].mon[d.id]&&s.group[d.ke].mon[d.id].watch){
        
                                tx({f:'monitor_watch_on',id:d.id,ke:d.ke},'MON_'+d.id)
                                misc.tx({viewers:Object.keys(s.group[d.ke].mon[d.id].watch).length,ke:d.ke,id:d.id},'MON_'+d.id)
                           }
                        });
                    break;
                }
            })
            cn.on('disconnect', function () {
                if(cn.removeListenerOnDisconnect){
                    s.group[cn.ke].mon[cn.socketVideoStream].emitter.removeListener('data',s.group[cn.ke].mon[cn.socketVideoStream].contentWriter[cn.channel])
                }
                if(cn.socketVideoStream){
                    return
                }
                if(cn.ke){
                    if(cn.monitor_watching){
                        cn.monitor_count=Object.keys(cn.monitor_watching)
                        if(cn.monitor_count.length>0){
                            cn.monitor_count.forEach(function(v){
                                camera.camera('watch_off',{id:v,ke:cn.monitor_watching[v].ke},s.cn(cn))
                            })
                        }
                    }else if(!cn.embedded){
                        if(s.group[cn.ke].users[cn.auth].login_type==='Dashboard'){
                            misc.tx({f:'user_status_change',ke:cn.ke,uid:cn.uid,status:0})
                        }
                        logging.log({ke:cn.ke,mid:'$USER'},{type:lang['Websocket Disconnected'],msg:{mail:s.group[cn.ke].users[cn.auth].mail,id:cn.uid,ip:cn.ip}})
                        delete(s.group[cn.ke].users[cn.auth]);
                    }
                }
                if(cn.pluginEngine){
                    s.connectedPlugins[cn.pluginEngine].plugged=false
                    misc.tx({f:'plugin_engine_unplugged',plug:cn.pluginEngine},'CPU')
                    delete(s.api[cn.pluginEngine])
                }
                if(cn.ocv){
                    misc.tx({f:'detector_unplugged',plug:s.ocv.plug},'CPU')
                    delete(s.ocv);
                    delete(s.api[cn.id])
                }
                if(cn.cron){
                    delete(s.cron);
                }
                if(cn.shinobi_child){
                    delete(s.child_nodes[cn.ip]);
                }
            })
        }
        return module;
}