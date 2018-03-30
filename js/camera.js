var fs = require('fs');
var chokidar = require('chokidar');
var connectionTester = require('connection-tester');
var events = require('events');
var PamDiff = require('pam-diff');
var Mp4Frag = require('mp4frag');
var P2P = require('pipe2pam');
var moment = require('moment');

module.exports = function(s,config,ffmpeg,logging,lang,misc){
    let module = {};
    
    module.camera=function(x,e,cn){
        if(x!=='motion'){
            var ee=s.init('noReference',e);
            if(!e){e={}};if(cn&&cn.ke&&!e.ke){e.ke=cn.ke};
            if(!e.mode){e.mode=x;}
            if(!e.id&&e.mid){e.id=e.mid}
        }
        if(e.details&&(e.details instanceof Object)===false){
            try{e.details=JSON.parse(e.details)}catch(err){}
        }
        //parse Objects
        (['detector_cascades','cords','input_map_choices']).forEach(function(v){
            if(e.details&&e.details[v]&&(e.details[v] instanceof Object)===false){
                try{
                    e.details[v]=JSON.parse(e.details[v]);
                    if(!e.details[v])e.details[v]={};
                }catch(err){
                    e.details[v]={};
                }
            }
        });
        //parse Arrays
        (['stream_channels','input_maps']).forEach(function(v){
            if(e.details&&e.details[v]&&(e.details[v] instanceof Array)===false){
                try{
                    e.details[v]=JSON.parse(e.details[v]);
                    if(!e.details[v])e.details[v]=[];
                }catch(err){
                    e.details[v]=[];
                }
            }
        });
        switch(x){
            case'control':
                if(!s.group[e.ke]||!s.group[e.ke].mon[e.id]){return}
                var monitorConfig = s.group[e.ke].mon_conf[e.id];
                if(monitorConfig.details.control!=="1"){logging.log(e,{type:lang['Control Error'],msg:lang.ControlErrorText1});return}
                if(!monitorConfig.details.control_base_url||monitorConfig.details.control_base_url===''){
                    e.base=s.init('url_no_path',monitorConfig);
                }else{
                    e.base=monitorConfig.details.control_base_url;
                }
                if(!monitorConfig.details.control_url_stop_timeout||monitorConfig.details.control_url_stop_timeout===''){monitorConfig.details.control_url_stop_timeout=1000}
                if(!monitorConfig.details.control_url_method||monitorConfig.details.control_url_method===''){monitorConfig.details.control_url_method="GET"}
                var setURL=function(url){
                    e.URLobject=URL.parse(url)
                    if(!e.URLobject.port){e.URLobject.port=80}
                    e.options = {
                        host: e.URLobject.hostname,
                        port: e.URLobject.port,
                        method: monitorConfig.details.control_url_method,
                        path: e.URLobject.pathname,
                    };
                    if(e.URLobject.query){
                        e.options.path=e.options.path+'?'+e.URLobject.query
                    }
                    if(e.URLobject.username&&e.URLobject.password){
                        e.options.auth=e.URLobject.username+':'+e.URLobject.password
                    }
                    if(e.URLobject.auth){
                        e.options.auth=e.URLobject.auth
                    }
                }
                setURL(e.base+monitorConfig.details['control_url_'+e.direction])
                http.request(e.options, function(first) {
                    var body = '';
                    var msg;
                    first.on('data', function(chunk) {
                        body+=chunk
                    });
                    first.on('end',function(){
                        if(monitorConfig.details.control_stop=='1'&&e.direction!=='center'){
                            logging.log(e,{type:'Control Triggered Started',msg:body});
                            setURL(e.base+monitorConfig.details['control_url_'+e.direction+'_stop'])
                            setTimeout(function(){
                                http.request(e.options, function(data) {
                                    var body=''
                                    data.on('data', function(chunk){
                                        body+=chunk
                                    })
                                    data.on('end', function(){
                                        msg = {ok:true,type:'Control Trigger Ended'};
                                        cn(msg)
                                        logging.log(e,msg);
                                    });
                                }).on('error', function(err) {
                                msg = {ok:false,type:'Control Error',msg:err};
                                cn(msg)
                                logging.log(e,msg);
                                }).end();
                            },monitorConfig.details.control_url_stop_timeout)
                        }else{
                            msg = {ok:true,type:'Control Triggered',msg:body};
                            cn(msg)
                            logging.log(e,msg);
                        }
                    });
                }).on('error', function(err) {
                    msg = {ok:false,type:'Control Error',msg:err};
                    cn(msg)
                    logging.log(e,msg);
                }).end();
            break;
            case'snapshot'://get snapshot from monitor URL
                if(config.doSnapshot===true){
                    if(e.mon.mode!=='stop'){
                        try{e.mon.details=JSON.parse(e.mon.details)}catch(er){}
                        if(e.mon.details.snap==='1'){
                            fs.readFile(s.dir.streams+e.ke+'/'+e.mid+'/s.jpg',function(err,data){
                                if(err){misc.misc.tx({f:'monitor_snapshot',snapshot:e.mon.name,snapshot_format:'plc',mid:e.mid,ke:e.ke},'GRP_'+e.ke);return};
                                misc.tx({f:'monitor_snapshot',snapshot:data,snapshot_format:'ab',mid:e.mid,ke:e.ke},'GRP_'+e.ke)
                            })
                        }else{
                            e.url=s.init('url',e.mon);
                            switch(e.mon.type){
                                case'mjpeg':case'h264':case'local':
                                    if(e.mon.type==='local'){e.url=e.mon.path;}
                                    e.spawn=spawn(config.ffmpegDir,('-loglevel quiet -i '+e.url+' -s 400x400 -r 25 -ss 1.8 -frames:v 1 -f singlejpeg pipe:1').split(' '),{detached: true})
                                    e.spawn.stdout.on('data',function(data){
                                    e.snapshot_sent=true; misc.tx({f:'monitor_snapshot',snapshot:data.toString('base64'),snapshot_format:'b64',mid:e.mid,ke:e.ke},'GRP_'+e.ke)
                                        e.spawn.kill();
                                    });
                                    e.spawn.on('close',function(data){
                                        if(!e.snapshot_sent){
                                            misc.tx({f:'monitor_snapshot',snapshot:e.mon.name,snapshot_format:'plc',mid:e.mid,ke:e.ke},'GRP_'+e.ke)
                                        }
                                        delete(e.snapshot_sent);
                                    });
                                break;
                                case'jpeg':
                                    request({url:e.url,method:'GET',encoding:null},function(err,data){
                                        if(err){misc.tx({f:'monitor_snapshot',snapshot:e.mon.name,snapshot_format:'plc',mid:e.mid,ke:e.ke},'GRP_'+e.ke);return};
                                        misc.tx({f:'monitor_snapshot',snapshot:data.body,snapshot_format:'ab',mid:e.mid,ke:e.ke},'GRP_'+e.ke)
                                    })
                                break;
                                default:
                                    misc.tx({f:'monitor_snapshot',snapshot:'...',snapshot_format:'plc',mid:e.mid,ke:e.ke},'GRP_'+e.ke)
                                break;
                            }
                        }
                    }else{
                        misc.tx({f:'monitor_snapshot',snapshot:'Disabled',snapshot_format:'plc',mid:e.mid,ke:e.ke},'GRP_'+e.ke)
                    }
                }else{
                    misc.tx({f:'monitor_snapshot',snapshot:e.mon.name,snapshot_format:'plc',mid:e.mid,ke:e.ke},'GRP_'+e.ke)
                }
            break;
            case'record_off'://stop recording and start
                if(!s.group[e.ke].mon[e.id].record){s.group[e.ke].mon[e.id].record={}}
                s.group[e.ke].mon[e.id].record.yes=0;
                module.camera('start',e);
            break;
            case'watch_on'://live streamers - join
    //            if(s.group[e.ke].mon[e.id].watch[cn.id]){module.camera('watch_off',e,cn,tx);return}
            s.init(0,{ke:e.ke,mid:e.id})
            if(!cn.monitor_watching){cn.monitor_watching={}}
            if(!cn.monitor_watching[e.id]){cn.monitor_watching[e.id]={ke:e.ke}}
            s.group[e.ke].mon[e.id].watch[cn.id]={};
    //            if(Object.keys(s.group[e.ke].mon[e.id].watch).length>0){
    //                s.sqlQuery('SELECT * FROM Monitors WHERE ke=? AND mid=?',[e.ke,e.id],function(err,r) {
    //                    if(r&&r[0]){
    //                        r=r[0];
    //                        r.url=s.init('url',r);
    //                        s.group[e.ke].mon.type=r.type;
    //                    }
    //                })
    //            }
            break;
            case'watch_off'://live streamers - leave
            if(cn.monitor_watching){delete(cn.monitor_watching[e.id])}
                if(s.group[e.ke].mon[e.id]&&s.group[e.ke].mon[e.id].watch){
                    delete(s.group[e.ke].mon[e.id].watch[cn.id]),e.ob=Object.keys(s.group[e.ke].mon[e.id].watch).length
                    if(e.ob===0){
                    delete(s.group[e.ke].mon[e.id].watch)
                    }
                }else{
                    e.ob=0;
                }
                if(misc.tx){
                    misc.tx({f:'monitor_watch_off',ke:e.ke,id:e.id,cnid:cn.id})
                };
                misc.tx({viewers:e.ob,ke:e.ke,id:e.id},'MON_'+e.id);
            break;
            case'restart'://restart monitor
                module.camera('stop',e)
                setTimeout(function(){
                    module.camera(e.mode,e)
                },1300)
            break;
            case'idle':case'stop'://stop monitor
                if(!s.group[e.ke]||!s.group[e.ke].mon[e.id]){return}
                if(s.group[e.ke].mon[e.id].eventBasedRecording.process){
                    clearTimeout(s.group[e.ke].mon[e.id].eventBasedRecording.timeout)
                    s.group[e.ke].mon[e.id].eventBasedRecording.allowEnd=true;
                    s.group[e.ke].mon[e.id].eventBasedRecording.process.kill('SIGTERM');
                }
                if(s.group[e.ke].mon[e.id].fswatch){s.group[e.ke].mon[e.id].fswatch.close();delete(s.group[e.ke].mon[e.id].fswatch)}
                if(s.group[e.ke].mon[e.id].fswatchStream){s.group[e.ke].mon[e.id].fswatchStream.close();delete(s.group[e.ke].mon[e.id].fswatchStream)}
                if(s.group[e.ke].mon[e.id].open){ee.filename=s.group[e.ke].mon[e.id].open,ee.ext=s.group[e.ke].mon[e.id].open_ext;s.video('close',ee)}
                if(s.group[e.ke].mon[e.id].last_frame){delete(s.group[e.ke].mon[e.id].last_frame)}
                if(s.group[e.ke].mon[e.id].started!==1){return}
                misc.kill(s.group[e.ke].mon[e.id].spawn,s.group[e.ke]);
                if(e.neglectTriggerTimer===1){
                    delete(e.neglectTriggerTimer);
                }else{
                    clearTimeout(s.group[e.ke].mon[e.id].trigger_timer)
                    delete(s.group[e.ke].mon[e.id].trigger_timer)
                }
                clearInterval(s.group[e.ke].mon[e.id].running);
                clearInterval(s.group[e.ke].mon[e.id].detector_notrigger_timeout)
                clearTimeout(s.group[e.ke].mon[e.id].err_fatal_timeout);
                s.group[e.ke].mon[e.id].started=0;
                if(s.group[e.ke].mon[e.id].record){s.group[e.ke].mon[e.id].record.yes=0}
                misc.tx({f:'monitor_stopping',mid:e.id,ke:e.ke,time:misc.moment()},'GRP_'+e.ke);
                module.camera('snapshot',{mid:e.id,ke:e.ke,mon:e})
                if(x==='stop'){
                    logging.log(e,{type:lang['Monitor Stopped'],msg:lang.MonitorStoppedText});
                    clearTimeout(s.group[e.ke].mon[e.id].delete)
                    if(e.delete===1){
                        s.group[e.ke].mon[e.id].delete=setTimeout(function(){
                            delete(s.group[e.ke].mon[e.id]);
                            delete(s.group[e.ke].mon_conf[e.id]);
                        },1000*60);
                    }
                }else{
                    misc.tx({f:'monitor_idle',mid:e.id,ke:e.ke,time:misc.moment()},'GRP_'+e.ke);
                    logging.log(e,{type:lang['Monitor Idling'],msg:lang.MonitorIdlingText});
                }
            break;
            case'start':case'record'://watch or record monitor url
                s.init(0,{ke:e.ke,mid:e.id})
                if(!s.group[e.ke].mon_conf[e.id]){s.group[e.ke].mon_conf[e.id]=s.init('noReference',e);}
                e.url=s.init('url',e);
                if(s.group[e.ke].mon[e.id].started===1){return}
                if(x==='start'&&e.details.detector_trigger=='1'){
                    s.group[e.ke].mon[e.id].motion_lock=setTimeout(function(){
                        clearTimeout(s.group[e.ke].mon[e.id].motion_lock);
                        delete(s.group[e.ke].mon[e.id].motion_lock);
                    },30000)
                }
                s.group[e.ke].mon[e.id].started=1;
                s.group[e.ke].mon[e.id].closeVideo = function(){
                    if(s.group[e.ke].mon[e.id].open){
                        s.video('close',e);
                    }
                };
                if(x==='record'){
                    s.group[e.ke].mon[e.id].record.yes=1;
                }else{
                    s.group[e.ke].mon[e.mid].record.yes=0;
                }
                if(e.details&&e.details.dir&&e.details.dir!==''){
                    //addStorage choice
                    e.dir=misc.checkCorrectPathEnding(e.details.dir)+e.ke+'/';
                    if (!fs.existsSync(e.dir)){
                        fs.mkdirSync(e.dir);
                    }
                    e.dir=e.dir+e.id+'/';
                    if (!fs.existsSync(e.dir)){
                        fs.mkdirSync(e.dir);
                    }
                }else{
                    //MAIN videos dir
                    e.dir=s.dir.videos+e.ke+'/';
                    if (!fs.existsSync(e.dir)){
                        fs.mkdirSync(e.dir);
                    }
                    e.dir=s.dir.videos+e.ke+'/'+e.id+'/';
                    if (!fs.existsSync(e.dir)){
                        fs.mkdirSync(e.dir);
                    }
                }
                var setStreamDir = function(){
                    //stream dir
                    e.sdir=s.dir.streams+e.ke+'/';
                    if (!fs.existsSync(e.sdir)){
                        fs.mkdirSync(e.sdir);
                    }
                    e.sdir=s.dir.streams+e.ke+'/'+e.id+'/';
                    if (!fs.existsSync(e.sdir)){
                        fs.mkdirSync(e.sdir);
                    }else{
                        s.file('delete_folder',e.sdir+'*')
                    }
                }
                setStreamDir()
                //start "no motion" checker
                if(e.details.detector=='1'&&e.details.detector_notrigger=='1'){
                    if(!e.details.detector_notrigger_timeout||e.details.detector_notrigger_timeout===''){
                        e.details.detector_notrigger_timeout=10
                    }
                    e.detector_notrigger_timeout=parseFloat(e.details.detector_notrigger_timeout)*1000*60;
                    s.sqlQuery('SELECT mail FROM Users WHERE ke=? AND details NOT LIKE ?',[e.ke,'%"sub"%'],function(err,r){
                        r=r[0];
                        s.group[e.ke].mon[e.id].detector_notrigger_timeout_function=function(){
                            if(config.mail&&e.details.detector_notrigger_mail=='1'){
                                e.mailOptions = {
                                    from: '"ShinobiCCTV" <no-reply@shinobi.video>', // sender address
                                    to: r.mail, // list of receivers
                                    subject: lang.NoMotionEmailText1+' '+e.name+' ('+e.id+')', // Subject line
                                    html: '<i>'+lang.NoMotionEmailText2+' '+e.details.detector_notrigger_timeout+' '+lang.minutes+'.</i>',
                                };
                                e.mailOptions.html+='<div><b>'+lang['Monitor Name']+' </b> : '+e.name+'</div>'
                                e.mailOptions.html+='<div><b>'+lang['Monitor ID']+' </b> : '+e.id+'</div>'
                                nodemailer.sendMail(e.mailOptions, (error, info) => {
                                    if (error) {
                                    logging.systemLog('detector:notrigger:sendMail',error)
                                        misc.tx({f:'error',ff:'detector_notrigger_mail',id:e.id,ke:e.ke,error:error},'GRP_'+e.ke);
                                        return ;
                                    }
                                    misc.tx({f:'detector_notrigger_mail',id:e.id,ke:e.ke,info:info},'GRP_'+e.ke);
                                });
                            }
                        }
                        clearInterval(s.group[e.ke].mon[e.id].detector_notrigger_timeout)
                        s.group[e.ke].mon[e.id].detector_notrigger_timeout=setInterval(s.group[e.ke].mon[e.id].detector_notrigger_timeout_function,s.group[e.ke].mon[e.id].detector_notrigger_timeout)
                    })
                }
                //cutoff time and recording check interval
                if(!e.details.cutoff||e.details.cutoff===''){e.cutoff=15}else{e.cutoff=parseFloat(e.details.cutoff)};
                if(isNaN(e.cutoff)===true){e.cutoff=15}
                var resetStreamCheck=function(){
                    clearTimeout(s.group[e.ke].mon[e.id].checkStream)
                    s.group[e.ke].mon[e.id].checkStream=setTimeout(function(){
                        if(s.group[e.ke].mon[e.id].started===1){
                            e.fn();
                            logging.log(e,{type:lang['Camera is not streaming'],msg:{msg:lang['Restarting Process']}});
                        }
                    },60000*1);
                }
                if(x==='record'||(x==='start'&&e.details.detector_record_method==='sip')){
                    var pathToName = function(filePath){
                        var split = filePath.split('/');
                        return split[split.length - 1]
                    }
                    s.group[e.ke].mon[e.id].fswatch = chokidar.watch(e.dir, {ignored: /(^|[\/\\])\../,ignoreInitial:true}).on('all', (event, filePath) => {
                        var filename = pathToName(filePath)
                        if(s.group[e.ke].mon[e.id].fixingVideos[filename]){return}
                        switch(event){
                            case'change':
                                var filename = pathToName(filePath)
                                if(s.platform!=='darwin'){
                                    if(s.group[e.ke].mon[e.id].fixingVideos[filename]){return}
                                    clearTimeout(s.group[e.ke].mon[e.id].checker)
                                    clearTimeout(s.group[e.ke].mon[e.id].checkStream)
                                    s.group[e.ke].mon[e.id].checker=setTimeout(function(){
                                        if(s.group[e.ke].mon[e.id].started===1){
                                            e.fn();
                                            logging.log(e,{type:lang['Camera is not recording'],msg:{msg:lang['Restarting Process']}});
                                        }
                                    },60000*2);
                                }
                            break;
                            case'add':
                                if(s.group[e.ke].mon[e.id].open){
                                    s.video('close',e);
                                    var row = Object.assign({},s.init('noReference',e));
                                    setTimeout(function(){
                                        if(row.details.detector==='1'&&s.group[row.ke].mon[row.id].started===1&&row.details&&row.details.detector_record_method==='del'&&row.details.detector_delete_motionless_videos==='1'&&s.group[row.ke].mon[row.id].detector_motion_count===0){
                                            if(row.details.loglevel!=='quiet'){
                                                logging.log(row,{type:lang['Delete Motionless Video'],msg:row.filename+'.'+row.ext});
                                            }
                                            s.video('delete',row)
                                        }
                                    },2000)
                                }
                                e.filename=filename.split('.')[0];
                                s.video('open',e);
                                s.group[e.ke].mon[e.id].open=e.filename;
                                s.group[e.ke].mon[e.id].open_ext=e.ext;
                                s.group[e.ke].mon[e.id].detector_motion_count=0;
                            break;
                        }
                    });
                }
                switch(x){
                    case'start':
                        switch(e.details.stream_type){
                            case'jpeg':case'hls':
                                if(s.platform!=='darwin'){
                                    s.group[e.ke].mon[e.id].fswatchStream = chokidar.watch(e.sdir, {ignored: /(^|[\/\\])\../,ignoreInitial:true}).on('all', (event, filePath) => {
                                        resetStreamCheck()
                                    })
                                }
                            break;
                        }
                    break;
                }
                module.camera('snapshot',{mid:e.id,ke:e.ke,mon:e})
                //check host to see if has password and user in it
                e.hosty=e.host.split('@');if(e.hosty[1]){e.hosty=e.hosty[1];}else{e.hosty=e.hosty[0];};

                    e.error_fatal=function(x){
                        clearTimeout(s.group[e.ke].mon[e.id].err_fatal_timeout);
                        ++e.error_fatal_count;
                        if(s.group[e.ke].mon[e.id].started===1){
                            s.group[e.ke].mon[e.id].err_fatal_timeout=setTimeout(function(){
                                if(e.details.fatal_max!==0&&e.error_fatal_count>e.details.fatal_max){
                                    module.camera('stop',{id:e.id,ke:e.ke})
                                }else{
                                    e.fn()
                                };
                            },5000);
                        }else{
                            misc.kill(s.group[e.ke].mon[e.id].spawn,s.group[e.ke]);
                        }
                    }
                    e.error_fatal_count=0;
                    e.fn=function(){//this function loops to create new files
                        setStreamDir()
                        clearTimeout(s.group[e.ke].mon[e.id].checker)
                        if(s.group[e.ke].mon[e.id].started===1){
                        e.error_count=0;
                        s.group[e.ke].mon[e.id].error_socket_timeout_count=0;
                        if(e.details.fatal_max===''){e.details.fatal_max=10}else{e.details.fatal_max=parseFloat(e.details.fatal_max)}
                        misc.kill(s.group[e.ke].mon[e.id].spawn,s.group[e.ke]);
                        e.draw=function(err,o){
                            if(o.success===true){
                                e.frames=0;
                                if(!s.group[e.ke].mon[e.id].record){s.group[e.ke].mon[e.id].record={yes:1}};
                                //launch ffmpeg (main)
                                s.group[e.ke].mon[e.id].spawn = ffmpeg.ffmpeg(e);//s.ffmpeg(e);
                                //on unexpected exit restart
                                s.group[e.ke].mon[e.id].spawn_exit=function(){
                                    if(s.group[e.ke].mon[e.id].started===1){
                                        if(e.details.loglevel!=='quiet'){
                                            logging.log(e,{type:lang['Process Unexpected Exit'],msg:{msg:lang['Process Crashed for Monitor']+' : '+e.id,cmd:s.group[e.ke].mon[e.id].ffmpeg}});
                                        }
                                        e.error_fatal();
                                    }
                                }
                                s.group[e.ke].mon[e.id].spawn.on('end',s.group[e.ke].mon[e.id].spawn_exit)
                                s.group[e.ke].mon[e.id].spawn.on('exit',s.group[e.ke].mon[e.id].spawn_exit)
                                //
    //                            s.group[e.ke].mon[e.id].spawn.stdio[5].on('data',function(data){
    //                                data = data.toString();
    //                                console.log('---')
    //                                var json = {}
    //                                data.split('\n').forEach(function(v){
    //                                    var vv = v.split('=')
    //                                    json[vv[0]] = vv[1]
    //                                })
    //                                console.log(json)
    //                            })
                                //emitter for mjpeg
                                if(!e.details.stream_mjpeg_clients||e.details.stream_mjpeg_clients===''||isNaN(e.details.stream_mjpeg_clients)===false){e.details.stream_mjpeg_clients=20;}else{e.details.stream_mjpeg_clients=parseInt(e.details.stream_mjpeg_clients)}
                                s.group[e.ke].mon[e.id].emitter = new events.EventEmitter().setMaxListeners(e.details.stream_mjpeg_clients);
                                logging.log(e,{type:'FFMPEG Process Started',msg:{cmd:s.group[e.ke].mon[e.id].ffmpeg}});
                                misc.tx({f:'monitor_starting',mode:x,mid:e.id,time:misc.moment()},'GRP_'+e.ke);
                                //start workers
                                if(e.type==='jpeg'){
                                    if(!e.details.sfps||e.details.sfps===''){
                                        e.details.sfps=parseFloat(e.details.sfps);
                                        if(isNaN(e.details.sfps)){e.details.sfps=1}
                                    }
                                    if(s.group[e.ke].mon[e.id].spawn){
                                        s.group[e.ke].mon[e.id].spawn.stdin.on('error',function(err){
                                            if(err&&e.details.loglevel!=='quiet'){
                                                logging.log(e,{type:'STDIN ERROR',msg:err});
                                            }
                                        })
                                    }else{
                                        if(x==='record'){
                                            logging.log(e,{type:lang.FFmpegCantStart,msg:lang.FFmpegCantStartText});
                                            return
                                        }
                                    }
                                    e.captureOne=function(f){
                                        s.group[e.ke].mon[e.id].record.request=request({url:e.url,method:'GET',encoding: null,timeout:15000},function(err,data){
                                            if(err){
                                                return;
                                            }
                                        }).on('data',function(d){
                                            if(!e.buffer0){
                                                e.buffer0=[d]
                                            }else{
                                                e.buffer0.push(d);
                                            }
                                            if((d[d.length-2] === 0xFF && d[d.length-1] === 0xD9)){
                                                e.buffer0=Buffer.concat(e.buffer0);
                                                ++e.frames;
                                                if(s.group[e.ke].mon[e.id].spawn&&s.group[e.ke].mon[e.id].spawn.stdin){
                                                    s.group[e.ke].mon[e.id].spawn.stdin.write(e.buffer0);
                                                }
                                                if(s.group[e.ke].mon[e.id].started===1){
                                                    s.group[e.ke].mon[e.id].record.capturing=setTimeout(function(){
                                                    e.captureOne()
                                                    },1000/e.details.sfps);
                                                }
                                                e.buffer0=null;
                                            }
                                            if(!e.timeOut){
                                                e.timeOut=setTimeout(function(){e.error_count=0;delete(e.timeOut);},3000);
                                            }

                                        }).on('error', function(err){
                                            ++e.error_count;
                                            clearTimeout(e.timeOut);delete(e.timeOut);
                                            if(e.details.loglevel!=='quiet'){
                                                logging.log(e,{type:lang['JPEG Error'],msg:{msg:lang.JPEGErrorText,info:err}});
                                                switch(err.code){
                                                    case'ESOCKETTIMEDOUT':
                                                    case'ETIMEDOUT':
                                                        ++s.group[e.ke].mon[e.id].error_socket_timeout_count
                                                        if(e.details.fatal_max!==0&&s.group[e.ke].mon[e.id].error_socket_timeout_count>e.details.fatal_max){
                                                            logging.log(e,{type:lang['Fatal Maximum Reached'],msg:{code:'ESOCKETTIMEDOUT',msg:lang.FatalMaximumReachedText}});
                                                            module.camera('stop',e)
                                                        }else{
                                                            logging.log(e,{type:lang['Restarting Process'],msg:{code:'ESOCKETTIMEDOUT',msg:lang.FatalMaximumReachedText}});
                                                            module.camera('restart',e)
                                                        }
                                                        return;
                                                    break;
                                                }
                                            }
                                            if(e.details.fatal_max!==0&&e.error_count>e.details.fatal_max){
                                                clearTimeout(s.group[e.ke].mon[e.id].record.capturing);
                                                e.fn();
                                            }
                                        });
                                }
                                e.captureOne()
                                }
                                if(!s.group[e.ke]||!s.group[e.ke].mon[e.id]){s.init(0,e)}
                                s.group[e.ke].mon[e.id].spawn.on('error',function(er){
                                    logging.log(e,{type:'Spawn Error',msg:er});e.error_fatal()
                                });
                                if(e.details.detector==='1'){
                                    misc.ocvTx({f:'init_monitor',id:e.id,ke:e.ke})
                                    //frames from motion detect
                                    if(e.details.detector_pam==='1'){
                                        var width,
                                            height,
                                            globalSensitivity,
                                            fullFrame = false
                                        if(s.group[e.ke].mon_conf[e.id].details.detector_scale_x===''||s.group[e.ke].mon_conf[e.id].details.detector_scale_y===''){
                                            width = s.group[e.ke].mon_conf[e.id].details.detector_scale_x;
                                            height = s.group[e.ke].mon_conf[e.id].details.detector_scale_y;
                                        }else{
                                            width = e.width
                                            height = e.height
                                        }
                                        if(e.details.detector_sensitivity===''){
                                            globalSensitivity = 10
                                        }else{
                                            globalSensitivity = parseInt(e.details.detector_sensitivity)
                                        }
                                        if(e.details.detector_frame==='1'){
                                            fullFrame={
                                                name:'FULL_FRAME',
                                                sensitivity:globalSensitivity,
                                                points:[
                                                    [0,0],
                                                    [0,height],
                                                    [width,height],
                                                    [width,0]
                                                ]
                                            };
                                        }
                                        var regions = misc.createPamDiffRegionArray(s.group[e.ke].mon_conf[e.id].details.cords,globalSensitivity,fullFrame);
                                        var noiseFilterArray = {};
                                        Object.keys(regions.notForPam).forEach(function(name){
                                            noiseFilterArray[name]=[];
                                        })
                                        s.group[e.ke].mon[e.id].pamDiff = new PamDiff({grayscale: 'luminosity', regions : regions.forPam});
                                        s.group[e.ke].mon[e.id].p2p = new P2P();
                                        var sendTrigger = function(trigger){
                                            var detectorObject = {
                                                f:'trigger',
                                                id:e.id,
                                                ke:e.ke,
                                                name:trigger.name,
                                                details:{
                                                    plug:'built-in',
                                                    name:trigger.name,
                                                    reason:'motion',
                                                    confidence:trigger.percent,
                                                },
                                                plates:[],
                                                imgHeight:height,
                                                imgWidth:width
                                            }
                                            if(s.group[e.ke].init.aws_s3_save=="1"){
                                                s.queueS3pushRequest(Object.assign({},detectorObject))
                                            }
                                            module.camera('motion',detectorObject)
                                        }
                                        var filterTheNoise = function(trigger){
                                            if(noiseFilterArray[trigger.name].length > 2){
                                                var thePreviousTriggerPercent = noiseFilterArray[trigger.name][noiseFilterArray[trigger.name].length - 1];
                                                var triggerDifference = trigger.percent - thePreviousTriggerPercent;
                                                if(((trigger.percent - thePreviousTriggerPercent) < 6)||(thePreviousTriggerPercent - trigger.percent) > -6){
                                                    noiseFilterArray[trigger.name].push(trigger.percent);
                                                }
                                            }else{
                                                noiseFilterArray[trigger.name].push(trigger.percent);
                                            }
                                            if(noiseFilterArray[trigger.name].length > 10){
                                                noiseFilterArray[trigger.name] = noiseFilterArray[trigger.name].splice(1,10)
                                            }
                                            var theNoise = 0;
                                            noiseFilterArray[trigger.name].forEach(function(v,n){
                                                theNoise += v;
                                            })
                                            theNoise = theNoise / noiseFilterArray[trigger.name].length;
                                            var triggerPercentWithoutNoise = trigger.percent - theNoise;
    //                                        console.log('------',trigger.name)
    //                                        console.log('noiseMadeFromThis',noiseFilterArray[trigger.name])
    //                                        console.log('theNoise',theNoise)
    //                                        console.log('trigger.percent - thePreviousTriggerPercent',(trigger.percent - thePreviousTriggerPercent))
    //                                        console.log('thePreviousTriggerPercent - trigger.percent',(thePreviousTriggerPercent - trigger.percent))
    //                                        console.log('triggerPercentWithoutNoise',triggerPercentWithoutNoise)
    //                                        console.log('thePreviousTriggerPercent',thePreviousTriggerPercent)
    //                                        console.log('trigger.percent',trigger.percent)
    //                                        console.log('sensitivity',regions.notForPam[trigger.name].sensitivity)
                                            if(triggerPercentWithoutNoise > regions.notForPam[trigger.name].sensitivity){
                                                sendTrigger(trigger);
                                            }
                                        }
                                        if(e.details.detector_noise_filter==='1'){
                                            s.group[e.ke].mon[e.id].pamDiff.on('diff', (data) => {
                                                data.trigger.forEach(filterTheNoise)
                                            })
                                        }else{
                                            s.group[e.ke].mon[e.id].pamDiff.on('diff', (data) => {
                                                data.trigger.forEach(sendTrigger)
                                            })
                                        }
                                        s.group[e.ke].mon[e.id].spawn.stdio[3].pipe(s.group[e.ke].mon[e.id].p2p).pipe(s.group[e.ke].mon[e.id].pamDiff);
                                    }else{
                                        s.group[e.ke].mon[e.id].spawn.stdio[3].on('data',function(d){
                                            if(s.ocv&&e.details.detector==='1'&&e.details.detector_send_frames==='1'){

                                                misc.ocvmisc.tx({f:'frame',mon:s.group[e.ke].mon_conf[e.id].details,ke:e.ke,id:e.id,time:misc.moment(),frame:d},s.group[e.ke].mon[e.id].detectorStreamTx);
                                            };
                                        })
                                    }
                                }
                                //frames to stream
                                ++e.frames;
                            switch(e.details.stream_type){
                                case'mp4':
                                    s.group[e.ke].mon[e.id].mp4frag['MAIN'] = new Mp4Frag();
                                    s.group[e.ke].mon[e.id].spawn.stdio[1].pipe(s.group[e.ke].mon[e.id].mp4frag['MAIN'])
                                break;
                                case'flv':
                                    e.frame_to_stream=function(d){
                                        if(!s.group[e.ke].mon[e.id].firstStreamChunk['MAIN'])s.group[e.ke].mon[e.id].firstStreamChunk['MAIN'] = d;
                                        e.frame_to_stream=function(d){
                                            resetStreamCheck()
                                            s.group[e.ke].mon[e.id].emitter.emit('data',d);
                                        }
                                        e.frame_to_stream(d)
                                    }
                                break;
                                case'mjpeg':
                                    e.frame_to_stream=function(d){
                                        resetStreamCheck()
                                        s.group[e.ke].mon[e.id].emitter.emit('data',d);
                                    }
                                break;
                                case'b64':case undefined:case null:
                                    e.frame_to_stream=function(d){
                                        resetStreamCheck()
                                        if(s.group[e.ke]&&s.group[e.ke].mon[e.id]&&s.group[e.ke].mon[e.id].watch&&Object.keys(s.group[e.ke].mon[e.id].watch).length>0){
                                            if(!e.buffer){
                                                e.buffer=[d]
                                            }else{
                                                e.buffer.push(d);
                                            }
                                            if((d[d.length-2] === 0xFF && d[d.length-1] === 0xD9)){
                                                e.buffer=Buffer.concat(e.buffer);
                                                misc.tx({f:'monitor_frame',ke:e.ke,id:e.id,time:misc.moment(),frame:e.buffer.toString('base64'),frame_format:'b64'},'MON_STREAM_'+e.id);
                                                e.buffer=null;
                                            }
                                            }
                                        }
                                break;
                            }
                                if(e.frame_to_stream){
                                    s.group[e.ke].mon[e.id].spawn.stdout.on('data',e.frame_to_stream);
                                }
                                if(e.details.stream_channels&&e.details.stream_channels!==''){
                                    var createStreamEmitter = function(channel,number){
                                        var pipeNumber = number+config.pipeAddition;
                                        if(!s.group[e.ke].mon[e.id].emitterChannel[pipeNumber]){
                                            s.group[e.ke].mon[e.id].emitterChannel[pipeNumber] = new events.EventEmitter().setMaxListeners(0);
                                        }
                                    var frame_to_stream
                                    switch(channel.stream_type){
                                        case'mp4':
                                            s.group[e.ke].mon[e.id].mp4frag[pipeNumber] = new Mp4Frag();
                                            s.group[e.ke].mon[e.id].spawn.stdio[pipeNumber].pipe(s.group[e.ke].mon[e.id].mp4frag[pipeNumber])
                                        break;
                                        case'mjpeg':
                                            frame_to_stream=function(d){
                                                s.group[e.ke].mon[e.id].emitterChannel[pipeNumber].emit('data',d);
                                            }
                                        break;
                                        case'flv':
                                            frame_to_stream=function(d){
                                                if(!s.group[e.ke].mon[e.id].firstStreamChunk[pipeNumber])s.group[e.ke].mon[e.id].firstStreamChunk[pipeNumber] = d;
                                                frame_to_stream=function(d){
                                                    s.group[e.ke].mon[e.id].emitterChannel[pipeNumber].emit('data',d);
                                                }
                                                frame_to_stream(d)
                                            }
                                        break;
                                        case'h264':
                                            frame_to_stream=function(d){
                                                s.group[e.ke].mon[e.id].emitterChannel[pipeNumber].emit('data',d);
                                            }
                                        break;
                                    }
                                        if(frame_to_stream){
                                            s.group[e.ke].mon[e.id].spawn.stdio[pipeNumber].on('data',frame_to_stream);
                                        }
                                    }
                                    e.details.stream_channels.forEach(createStreamEmitter)
                                }
                                if(x==='record'||e.type==='mjpeg'||e.type==='h264'||e.type==='local'){
                                    s.group[e.ke].mon[e.id].spawn.stderr.on('data',function(d){
                                        d=d.toString();
                                        e.chk=function(x){return d.indexOf(x)>-1;}
                                        switch(true){
                                                //mp4 output with webm encoder chosen
                                            case e.chk('Could not find tag for vp8'):
                                            case e.chk('Only VP8 or VP9 Video'):
                                            case e.chk('Could not write header'):
    //                                            switch(e.ext){
    //                                                case'mp4':
    //                                                    e.details.vcodec='libx264'
    //                                                    e.details.acodec='none'
    //                                                break;
    //                                                case'webm':
    //                                                    e.details.vcodec='libvpx'
    //                                                    e.details.acodec='none'
    //                                                break;
    //                                            }
    //                                            if(e.details.stream_type==='hls'){
    //                                                e.details.stream_vcodec='libx264'
    //                                                e.details.stream_acodec='no'
    //                                            }
    //                                            module.camera('restart',e)
                                                return logging.log(e,{type:lang['Incorrect Settings Chosen'],msg:{msg:d}})
                                            break;
                                            case e.chk('NULL @'):
                                            case e.chk('RTP: missed'):
                                            case e.chk('deprecated pixel format used, make sure you did set range correctly'):
                                                return
                                            break;
    //                                                case e.chk('av_interleaved_write_frame'):
                                            case e.chk('Connection refused'):
                                            case e.chk('Connection timed out'):
                                                //restart
                                                setTimeout(function(){logging.log(e,{type:lang["Can't Connect"],msg:lang['Retrying...']});e.error_fatal();},1000)
                                            break;
    //                                        case e.chk('No such file or directory'):
    //                                        case e.chk('Unable to open RTSP for listening'):
    //                                        case e.chk('timed out'):
    //                                        case e.chk('Invalid data found when processing input'):
    //                                        case e.chk('Immediate exit requested'):
    //                                        case e.chk('reset by peer'):
    //                                           if(e.frames===0&&x==='record'){s.video('delete',e)};
    //                                            setTimeout(function(){
    //                                                if(!s.group[e.ke].mon[e.id].spawn){e.fn()}
    //                                            },2000)
    //                                        break;
                                            case e.chk('mjpeg_decode_dc'):
                                            case e.chk('bad vlc'):
                                            case e.chk('error dc'):
                                                e.fn()
                                            break;
                                            case /T[0-9][0-9]-[0-9][0-9]-[0-9][0-9]./.test(d):
                                                return logging.log(e,{type:lang['Video Finished'],msg:{filename:d}})
                                            break;
                                        }
                                        logging.log(e,{type:"FFMPEG STDERR",msg:d})
                                    });
                                }
                            }else{
                                logging.log(e,{type:lang["Can't Connect"],msg:lang['Retrying...']});e.error_fatal();return;
                            }
                        }
                        if(e.type!=='socket'&&e.type!=='dashcam'&&e.protocol!=='udp'&&e.type!=='local'){
                            connectionTester.test(e.hosty,e.port,2000,e.draw);
                        }else{
                            e.draw(null,{success:true})
                        }
                    }else{
                        misc.kill(s.group[e.ke].mon[e.id].spawn,s.group[e.ke]);
                    }
                    }
                    //start drawing files
                    if(s.child_help===true){
                        e.ch=Object.keys(s.child_nodes);
                        if(e.ch.length>0){
                            e.ch_stop=0;
                            e.fn=function(n){
                            connectionTester.test(e.hosty,e.port,2000,function(err,o){
                                if(o.success===true){
                                    s.video('open',e);
                                    e.frames=0;
                                    s.group[e.ke].mon[e.id].spawn={};
                                    s.group[e.ke].mon[e.id].child_node=n;
                                    misc.cx({f:'spawn',d:s.init('noReference',e),mon:s.init('noReference',s.group[e.ke].mon[e.mid])},s.group[e.ke].mon[e.mid].child_node_id)
                                }else{
    //                                logging.systemLog('Cannot Connect, Retrying...',e.id);
                                    e.error_fatal();return;
                                }
                            })
                            }
                            e.ch.forEach(function(n){
                                if(e.ch_stop===0&&s.child_nodes[n].cpu<80){
                                    e.ch_stop=1;
                                    s.group[e.ke].mon[e.mid].child_node=n;
                                    s.group[e.ke].mon[e.mid].child_node_id=s.child_nodes[n].cnid;
                                    e.fn(n);
                                }
                            })
                        }else{
                            e.fn();
                        }
                    }else{
                        e.fn();
                    }
            break;
            case'motion':
                var d=e;
                if(s.group[d.ke].mon[d.id].open){
                    d.details.videoTime = s.group[d.ke].mon[d.id].open;
                }
                var detailString = JSON.stringify(d.details);
                if(!s.group[d.ke]||!s.group[d.ke].mon[d.id]){
                    return logging.systemLog(lang['No Monitor Found, Ignoring Request'])
                }
                d.mon=s.group[d.ke].mon_conf[d.id];
                if(!s.group[d.ke].mon[d.id].detector_motion_count){
                    s.group[d.ke].mon[d.id].detector_motion_count=0
                }
                s.group[d.ke].mon[d.id].detector_motion_count+=1
                if(s.group[d.ke].mon[d.id].motion_lock){
                    return
                }
                var detector_lock_timeout
                if(!d.mon.details.detector_lock_timeout||d.mon.details.detector_lock_timeout===''){
                    detector_lock_timeout = 2000
                }
                detector_lock_timeout = parseFloat(d.mon.details.detector_lock_timeout);
                if(!s.group[d.ke].mon[d.id].detector_lock_timeout){
                    s.group[d.ke].mon[d.id].detector_lock_timeout=setTimeout(function(){
                        clearTimeout(s.group[d.ke].mon[d.id].detector_lock_timeout)
                        delete(s.group[d.ke].mon[d.id].detector_lock_timeout)
                    },detector_lock_timeout)
                }else{
                    return
                }
                d.cx={f:'detector_trigger',id:d.id,ke:d.ke,details:d.details};
                misc.tx(d.cx,'DETECTOR_'+d.ke+d.id);
                if(d.mon.details.detector_notrigger=='1'){
                    var detector_notrigger_timeout
                    if(!d.mon.details.detector_notrigger_timeout||d.mon.details.detector_notrigger_timeout===''){
                        detector_notrigger_timeout = 10
                    }
                    detector_notrigger_timeout = parseFloat(d.mon.details.detector_notrigger_timeout)*1000*60;
                    s.group[e.ke].mon[e.id].detector_notrigger_timeout = detector_notrigger_timeout;
                    clearInterval(s.group[d.ke].mon[d.id].detector_notrigger_timeout)
                    s.group[d.ke].mon[d.id].detector_notrigger_timeout = setInterval(s.group[d.ke].mon[d.id].detector_notrigger_timeout_function,detector_notrigger_timeout)
                }
                if(d.mon.details.detector_webhook=='1'){
                    var detector_webhook_url = d.mon.details.detector_webhook_url
                        .replace(/{{TIME}}/g,moment(new Date).format())
                        .replace(/{{MONITOR_ID}}/g,d.id)
                        .replace(/{{GROUP_KEY}}/g,d.ke)
                        .replace(/{{DETAILS}}/g,detailString)
                    http.get(detector_webhook_url, function(data) {
                        data.setEncoding('utf8');
                        var chunks='';
                        data.on('data', (chunk) => {
                            chunks+=chunk;
                        });
                        data.on('end', () => {

                        });

                    }).on('error', function(e) {

                    }).end();
                }
                var detector_timeout
                if(!d.mon.details.detector_timeout||d.mon.details.detector_timeout===''){
                    detector_timeout = 10
                }else{
                    detector_timeout = parseFloat(d.mon.details.detector_timeout)
                }
                if(d.mon.mode=='start'&&d.mon.details.detector_trigger==='1'&&d.mon.details.detector_record_method==='sip'){
                    //s.group[d.ke].mon[d.id].eventBasedRecording.timeout
    //                clearTimeout(s.group[d.ke].mon[d.id].eventBasedRecording.timeout)
                    s.group[d.ke].mon[d.id].eventBasedRecording.timeout = setTimeout(function(){
                        s.group[d.ke].mon[d.id].eventBasedRecording.allowEnd=true;
    //                    s.group[d.ke].mon[d.id].eventBasedRecording.process.stdin.setEncoding('utf8');
    //                    s.group[d.ke].mon[d.id].eventBasedRecording.process.stdin.write('q');
    //                    s.group[d.ke].mon[d.id].eventBasedRecording.process.kill('SIGTERM');
    //                    s.group[d.ke].mon[d.id].closeVideo()
                    },detector_timeout * 950 * 60)
                    if(!s.group[d.ke].mon[d.id].eventBasedRecording.process){
                        if(!d.auth){
                            d.auth=misc.gid();
                        }
                        if(!s.group[d.ke].users[d.auth]){
                            s.group[d.ke].users[d.auth]={system:1,details:{},lang:lang}
                        }
                        s.group[d.ke].mon[d.id].eventBasedRecording.allowEnd = false;
                        var runRecord = function(){
                            logging.log(d,{type:"Traditional Recording",msg:"Started"})
                            //-t 00:'+moment(new Date(detector_timeout * 1000 * 60)).format('mm:ss')+'
                            s.group[d.ke].mon[d.id].eventBasedRecording.process = spawn(config.ffmpegDir,ffmpeg.split(('-loglevel warning -analyzeduration 1000000 -probesize 1000000 -re -i http://'+config.ip+':'+config.port+'/'+d.auth+'/hls/'+d.ke+'/'+d.id+'/detectorStream.m3u8 -t 00:'+moment(new Date(detector_timeout * 1000 * 60)).format('mm:ss')+' -c:v copy -c:a copy -strftime 1 "'+s.video('getDir',d.mon)+misc.moment()+'.mp4"').replace(/\s+/g,' ').trim()))
                            var ffmpegError='';
                            var error
                            s.group[d.ke].mon[d.id].eventBasedRecording.process.stderr.on('data',function(data){
                                logging.log(d,{type:"Traditional Recording",msg:data.toString()})
                            })
                            s.group[d.ke].mon[d.id].eventBasedRecording.process.on('close',function(){
                                if(!s.group[d.ke].mon[d.id].eventBasedRecording.allowEnd){
                                    logging.log(d,{type:"Traditional Recording",msg:"Detector Recording Process Exited Prematurely. Restarting."})
                                    runRecord()
                                    return
                                }
                                logging.log(d,{type:"Traditional Recording",msg:"Detector Recording Complete"})
                                s.group[d.ke].mon[d.id].closeVideo()
                                delete(s.group[d.ke].users[d.auth])
                                logging.log(d,{type:"Traditional Recording",msg:'Clear Recorder Process'})
                                delete(s.group[d.ke].mon[d.id].eventBasedRecording.process)
                                delete(s.group[d.ke].mon[d.id].eventBasedRecording.timeout)
                                clearTimeout(s.group[d.ke].mon[d.id].checker)
                            })
                        }
                        runRecord()
                    }
                }else{
                    if(d.mon.mode!=='stop'&&d.mon.details.detector_trigger=='1'&&d.mon.details.detector_record_method==='hot'){
                        if(!d.auth){
                            d.auth=misc.gid();
                        }
                        if(!s.group[d.ke].users[d.auth]){
                            s.group[d.ke].users[d.auth]={system:1,details:{},lang:lang}
                        }
                        d.urlQuery=[]
                        d.url='http://'+config.ip+':'+config.port+'/'+d.auth+'/monitor/'+d.ke+'/'+d.id+'/record/'+detector_timeout+'/min';
                        if(d.mon.details.watchdog_reset!=='0'){
                            d.urlQuery.push('reset=1')
                        }
                        if(d.mon.details.detector_trigger_record_fps&&d.mon.details.detector_trigger_record_fps!==''&&d.mon.details.detector_trigger_record_fps!=='0'){
                            d.urlQuery.push('fps='+d.mon.details.detector_trigger_record_fps)
                        }
                        if(d.urlQuery.length>0){
                            d.url+='?'+d.urlQuery.join('&')
                        }
                        http.get(d.url, function(data) {
                            data.setEncoding('utf8');
                            var chunks='';
                            data.on('data', (chunk) => {
                                chunks+=chunk;
                            });
                            data.on('end', () => {
                                delete(s.group[d.ke].users[d.auth])
                                d.cx.f='detector_record_engaged';
                                d.cx.msg=JSON.parse(chunks);
                                misc.tx(d.cx,'GRP_'+d.ke);
                            });

                        }).on('error', function(e) {

                        }).end();
                    }
                }
                //mailer
                if(config.mail&&!s.group[d.ke].mon[d.id].detector_mail&&d.mon.details.detector_mail==='1'){
                    s.sqlQuery('SELECT mail FROM Users WHERE ke=? AND details NOT LIKE ?',[d.ke,'%"sub"%'],function(err,r){
                        r=r[0];
                        var detector_mail_timeout
                        if(!d.mon.details.detector_mail_timeout||d.mon.details.detector_mail_timeout===''){
                            detector_mail_timeout = 1000*60*10;
                        }else{
                            detector_mail_timeout = parseFloat(d.mon.details.detector_mail_timeout)*1000*60;
                        }
                        //lock mailer so you don't get emailed on EVERY trigger event.
                        s.group[d.ke].mon[d.id].detector_mail=setTimeout(function(){
                            //unlock so you can mail again.
                            clearTimeout(s.group[d.ke].mon[d.id].detector_mail);
                            delete(s.group[d.ke].mon[d.id].detector_mail);
                        },detector_mail_timeout);
                        d.frame_filename='Motion_'+(d.mon.name.replace(/[^\w\s]/gi, ''))+'_'+d.id+'_'+d.ke+'_'+misc.moment()+'.jpg';
                        fs.readFile(s.dir.streams+'/'+d.ke+'/'+d.id+'/s.jpg',function(err, frame){
                            d.mailOptions = {
                                from: '"ShinobiCCTV" <no-reply@shinobi.video>', // sender address
                                to: r.mail, // list of receivers
                                subject: lang.Event+' - '+d.frame_filename, // Subject line
                                html: '<i>'+lang.EventText1+' '+moment(new Date).format()+'.</i>',
                            };
                            if(err){
                                logging.systemLog(lang.EventText2+' '+d.ke+' '+d.id,err)
                            }else{
                                d.mailOptions.attachments=[
                                    {
                                        filename: d.frame_filename,
                                        content: frame
                                    }
                                ]
                                d.mailOptions.html='<i>'+lang.EventText3+'</i>'
                            }
                                Object.keys(d.details).forEach(function(v,n){
                                d.mailOptions.html+='<div><b>'+v+'</b> : '+d.details[v]+'</div>'
                            })
                            nodemailer.sendMail(d.mailOptions, (error, info) => {
                                if (error) {
                                    logging.systemLog(lang.MailError,error)
                                    return ;
                                }
                            });
                        })
                    });
                }
                //save this detection result in SQL, only coords. not image.
                if(d.mon.details.detector_save==='1'){
                    s.sqlQuery('INSERT INTO Events (ke,mid,details) VALUES (?,?,?)',[d.ke,d.id,detailString])
                }
                if(d.mon.details.detector_command_enable==='1'&&!s.group[d.ke].mon[d.id].detector_command){
                    var detector_command_timeout
                    if(!d.mon.details.detector_command_timeout||d.mon.details.detector_command_timeout===''){
                        detector_command_timeout = 1000*60*10;
                    }else{
                        detector_command_timeout = parseFloat(d.mon.details.detector_command_timeout)*1000*60;
                    }
                    s.group[d.ke].mon[d.id].detector_command=setTimeout(function(){
                        clearTimeout(s.group[d.ke].mon[d.id].detector_command);
                        delete(s.group[d.ke].mon[d.id].detector_command);

                    },detector_command_timeout);
                    var detector_command = d.mon.details.detector_command
                        .replace(/{{TIME}}/g,moment(new Date).format())
                        .replace(/{{MONITOR_ID}}/g,d.id)
                        .replace(/{{GROUP_KEY}}/g,d.ke)
                        .replace(/{{DETAILS}}/g,detailString)
                    if(d.details.confidence){
                        detector_command = detector_command
                        .replace(/{{CONFIDENCE}}/g,d.details.confidence)
                    }
                    exec(detector_command,{detached: true})
                }
            break;
        }
        if(typeof cn==='function'){setTimeout(function(){cn()},1000);}
    }
    return module;
}