var express = require('express');
var app = express();
var appHTTPS = express();
var http = require('http');
var https = require('https');
var fs = require('fs');
var bodyParser = require('body-parser');
var server = http.createServer(app);
var CircularJSON = require('circular-json');

module.exports = function(s,config,logging,location,screen,io,lang){
    let module = {};
    
    //SSL options
    if(config.ssl&&config.ssl.key&&config.ssl.cert){
        config.ssl.key=fs.readFileSync(misc.checkRelativePath(config.ssl.key),'utf8')
        config.ssl.cert=fs.readFileSync(misc.checkRelativePath(config.ssl.cert),'utf8')
        if(config.ssl.port===undefined){
            config.ssl.port=443
        }
        if(config.ssl.bindip===undefined){
            config.ssl.bindip=config.bindip
        }
        if(config.ssl.ca&&config.ssl.ca instanceof Array){
            config.ssl.ca.forEach(function(v,n){
                config.ssl.ca[n]=fs.readFileSync(misc.checkRelativePath(v),'utf8')
            })
        }
        var serverHTTPS = https.createServer(config.ssl,app);
        serverHTTPS.listen(config.ssl.port,config.bindip,function(){
            console.log('SSL '+lang.Shinobi+' - SSL PORT : '+config.ssl.port);
        });
        io.attach(serverHTTPS);
    }
    //start HTTP
    server.listen(config.port,config.bindip,function(){
        console.log(lang.Shinobi+' - PORT : '+config.port);
    });
    io.attach(server);

    module.init = function(){
        app.enable('trust proxy');
        app.use('/libs',express.static(location.basedir + '/web/libs'));
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({extended: true}));
        app.set('views', location.basedir + '/web/pages');
        app.set('view engine','ejs');
        //readme
        app.get('/:auth/logout/:ke/:id', function (req,res){
            if(s.group[req.params.ke]&&s.group[req.params.ke].users[req.params.auth]){
                delete(s.api[req.params.auth]);
                delete(s.group[req.params.ke].users[req.params.auth]);
                s.sqlQuery("UPDATE Users SET auth=? WHERE auth=? AND ke=? AND uid=?",['',req.params.auth,req.params.ke,req.params.id])
                res.end(s.s({ok:true,msg:'You have been logged out, session key is now inactive.'}, null, 3))
            }else{
                res.end(s.s({ok:false,msg:'This group key does not exist or this user is not logged in.'}, null, 3))
            }
        });
        //readme
        app.get('/info', function (req,res){
            res.sendFile(location.basedir+'/index.html');
        });
        //main page
        app.get('/', function (req,res){
            res.render('index',{lang:lang,config:config,screen:'dashboard'},function(err,html){
                if(err){
                    logging.systemLog(err)
                }
                res.end(html)
            })
        });
        //admin page
        app.get('/admin', function (req,res){
            res.render('index',{lang:lang,config:config,screen:'admin'},function(err,html){
                if(err){
                    logging.systemLog(err)
                }
                res.end(html)
            })
        });
        //super page
        app.get('/super', function (req,res){
            res.render('index',{lang:lang,config:config,screen:'super'},function(err,html){
                if(err){
                    logging.systemLog(err)
                }
                res.end(html)
            })
        });
        //update server
        app.get('/:auth/update/:key', function (req,res){
            req.ret={ok:false};
            res.setHeader('Content-Type', 'application/json');
            req.fn=function(user){
                if(!config.updateKey){
                    req.ret.msg=user.lang.updateKeyText1;
                    return;
                }
                if(req.params.key===config.updateKey){
                    req.ret.ok=true;
                    exec('chmod +x '+location.basedir+'/UPDATE.sh&&'+location.basedir+'/UPDATE.sh',{detached: true})
                }else{
                    req.ret.msg=user.lang.updateKeyText2;
                }
                res.end(s.s(req.ret, null, 3));
            }
            s.auth(req.params,req.fn,res,req);
        });
        //get user details by API key
        app.get('/:auth/userInfo/:ke',function (req,res){
            req.ret={ok:false};
            res.setHeader('Content-Type', 'application/json');
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            s.auth(req.params,function(user){
                req.ret.ok=true
                req.ret.user=user
                res.end(s.s(req.ret, null, 3));
            },res,req);
        })
        //register function
        app.post('/:auth/register/:ke/:uid',function (req,res){
            req.resp={ok:false};
            res.setHeader('Content-Type', 'application/json');
            s.auth(req.params,function(user){
                s.sqlQuery('SELECT * FROM Users WHERE uid=? AND ke=? AND details NOT LIKE ? LIMIT 1',[req.params.uid,req.params.ke,'%"sub"%'],function(err,u) {
                    if(u&&u[0]){
                        if(req.body.mail!==''&&req.body.pass!==''){
                            if(req.body.pass===req.body.password_again){
                                s.sqlQuery('SELECT * FROM Users WHERE mail=?',[req.body.mail],function(err,r) {
                                    if(r&&r[0]){//found one exist
                                        req.resp.msg='Email address is in use.';
                                    }else{//create new
                                        req.resp.msg='New Account Created';req.resp.ok=true;
                                        req.gid=misc.gid();
                                        req.body.details='{"sub":"1","allmonitors":"1"}';
                                        s.sqlQuery('INSERT INTO Users (ke,uid,mail,pass,details) VALUES (?,?,?,?,?)',[req.params.ke,req.gid,req.body.mail,misc.md5(req.body.pass),req.body.details])
                                        misc.tx({f:'add_sub_account',details:req.body.details,ke:req.params.ke,uid:req.gid,mail:req.body.mail},'ADM_'+req.params.ke);
                                    }
                                    res.end(s.s(req.resp,null,3));
                                })
                            }else{
                                req.resp.msg=user.lang['Passwords Don\'t Match'];
                            }
                        }else{
                            req.resp.msg=user.lang['Fields cannot be empty'];
                        }
                    }else{
                        req.resp.msg=user.lang['Not an Administrator Account'];
                    }
                    if(req.resp.msg){
                        res.end(s.s(req.resp,null,3));
                    }
                })
            },res,req);
        })
        app.post(['/','/:screen'],function (req,res){screen.init(req,res)});
        // Get MPEG-DASH stream (mpd)
        app.get('/:auth/mpd/:ke/:id/:file', function (req,res){
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            req.fn=function(user){
                req.extension=req.params.file.split('.')
                req.extension=req.extension[req.extension.length-1]
                switch(req.extension){
                    case'mpd':
                        res.header("Content-Type","application/dash+xml");
                    break;
                }
                req.dir=s.dir.streams+req.params.ke+'/'+req.params.id+'/'+req.params.file;
                res.on('finish',function(){res.end();});
                if (fs.existsSync(req.dir)){
                    fs.createReadStream(req.dir).pipe(res);
                }else{
                    res.end(user.lang['File Not Found'])
                }
            }
            s.auth(req.params,req.fn,res,req);
        });
        // Get HLS stream (m3u8)
        app.get(['/:auth/hls/:ke/:id/:file','/:auth/hls/:ke/:id/:channel/:file'], function (req,res){
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            req.fn=function(user){
                req.dir=s.dir.streams+req.params.ke+'/'+req.params.id+'/'
                if(req.params.channel){
                    req.dir+='channel'+(parseInt(req.params.channel)+config.pipeAddition)+'/'+req.params.file;
                }else{
                    req.dir+=req.params.file;
                }
                res.on('finish',function(){res.end();});
                if (fs.existsSync(req.dir)){
                    fs.createReadStream(req.dir).pipe(res);
                }else{
                    res.end(user.lang['File Not Found'])
                }
            }
            s.auth(req.params,req.fn,res,req);
        });
        //Get JPEG snap
        app.get('/:auth/jpeg/:ke/:id/s.jpg', function(req,res){
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            s.auth(req.params,function(user){
                if(user.details.sub&&user.details.allmonitors!=='1'&&user.details.monitors&&user.details.monitors.indexOf(req.params.id)===-1){
                    res.end(user.lang['Not Permitted'])
                    return
                }
                req.dir=s.dir.streams+req.params.ke+'/'+req.params.id+'/s.jpg';
                    res.writeHead(200, {
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                    });
                res.on('finish',function(){res.end();delete(res)});
                if (fs.existsSync(req.dir)){
                    fs.createReadStream(req.dir).pipe(res);
                }else{
                    fs.createReadStream(config.defaultMjpeg).pipe(res);
                }
            },res,req);
        });
        //Get FLV stream
        app.get(['/:auth/flv/:ke/:id/s.flv','/:auth/flv/:ke/:id/:channel/s.flv'], function(req,res) {
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            s.auth(req.params,function(user){
                var Emitter,chunkChannel
                if(!req.params.channel){
                    Emitter = s.group[req.params.ke].mon[req.params.id].emitter
                    chunkChannel = 'MAIN'
                }else{
                    Emitter = s.group[req.params.ke].mon[req.params.id].emitterChannel[parseInt(req.params.channel)+config.pipeAddition]
                    chunkChannel = parseInt(req.params.channel)+config.pipeAddition
                }
                if(s.group[req.params.ke].mon[req.params.id].firstStreamChunk[chunkChannel]){
                    //variable name of contentWriter
                    var contentWriter
                    //set headers
                    res.setHeader('Content-Type', 'video/x-flv');
                    res.setHeader('Access-Control-Allow-Origin','*');
                    //write first frame on stream
                    res.write(s.group[req.params.ke].mon[req.params.id].firstStreamChunk[chunkChannel])
                    //write new frames as they happen
                    Emitter.on('data',contentWriter=function(buffer){
                        res.write(buffer)
                    })
                    //remove contentWriter when client leaves
                    res.on('close', function () {
                        Emitter.removeListener('data',contentWriter)
                    })
                }else{
                    res.setHeader('Content-Type', 'application/json');
                    res.end(s.s({ok:false,msg:'FLV not started or not ready'},null,3))
                }
            })
        })
        //montage - stand alone squished view with gridstackjs
        app.get(['/:auth/grid/:ke','/:auth/grid/:ke/:group'], function(req,res) {
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            s.auth(req.params,function(user){
                if(user.permissions.get_monitors==="0"){
                    res.end(user.lang['Not Permitted'])
                    return
                }
                
                req.params.protocol=req.protocol;
                req.sql='SELECT * FROM Monitors WHERE mode!=? AND mode!=? AND ke=?';req.ar=['stop','idle',req.params.ke];
                if(!req.params.id){
                    if(user.details.sub&&user.details.monitors&&user.details.allmonitors!=='1'){
                        try{user.details.monitors=JSON.parse(user.details.monitors);}catch(er){}
                        req.or=[];
                        user.details.monitors.forEach(function(v,n){
                            req.or.push('mid=?');req.ar.push(v)
                        })
                        req.sql+=' AND ('+req.or.join(' OR ')+')'
                    }
                }else{
                    if(!user.details.sub||user.details.allmonitors!=='0'||user.details.monitors.indexOf(req.params.id)>-1){
                        req.sql+=' and mid=?';req.ar.push(req.params.id)
                    }else{
                        res.end(user.lang['There are no monitors that you can view with this account.']);
                        return;
                    }
                }
                s.sqlQuery(req.sql,req.ar,function(err,r){
                    if(req.params.group){
                        var filteredByGroupCheck = {};
                        var filteredByGroup = [];
                        r.forEach(function(v,n){
                            var details = JSON.parse(r[n].details);
                            try{
                                req.params.group.split('|').forEach(function(group){
                                    var groups = JSON.parse(details.groups);
                                    if(groups.indexOf(group) > -1 && !filteredByGroupCheck[v.mid]){
                                        filteredByGroupCheck[v.mid] = true;
                                        filteredByGroup.push(v)
                                    }
                                })
                            }catch(err){
                                
                            }
                        })
                        r = filteredByGroup;
                    }
                    r.forEach(function(v,n){
                        if(s.group[v.ke]&&s.group[v.ke].mon[v.mid]&&s.group[v.ke].mon[v.mid].watch){
                            r[n].currentlyWatching=Object.keys(s.group[v.ke].mon[v.mid].watch).length
                        }
                        r[n].subStream={}
                        var details = JSON.parse(r[n].details)
                        if(details.snap==='1'){
                            r[n].subStream.jpeg = '/'+req.params.auth+'/jpeg/'+v.ke+'/'+v.mid+'/s.jpg'
                        }
                        if(details.stream_channels&&details.stream_channels!==''){
                            try{
                                details.stream_channels=JSON.parse(details.stream_channels)
                                r[n].channels=[]
                                details.stream_channels.forEach(function(b,m){
                                    var streamURL
                                    switch(b.stream_type){
                                        case'mjpeg':
                                            streamURL='/'+req.params.auth+'/mjpeg/'+v.ke+'/'+v.mid+'/'+m
                                        break;
                                        case'hls':
                                            streamURL='/'+req.params.auth+'/hls/'+v.ke+'/'+v.mid+'/'+m+'/s.m3u8'
                                        break;
                                        case'h264':
                                            streamURL='/'+req.params.auth+'/h264/'+v.ke+'/'+v.mid+'/'+m
                                        break;
                                        case'flv':
                                            streamURL='/'+req.params.auth+'/flv/'+v.ke+'/'+v.mid+'/'+m+'/s.flv'
                                        break;
                                        case'mp4':
                                            streamURL='/'+req.params.auth+'/mp4/'+v.ke+'/'+v.mid+'/'+m+'/s.mp4'
                                        break;
                                    }
                                    r[n].channels.push(streamURL)
                                })
                            }catch(err){
                                logging.log(req.params,{type:'Broken Monitor Object',msg:'Stream Channels Field is damaged. Skipping.'})
                            }
                        }
                    })
                    res.render('grid',{
                        data:Object.assign(req.params,req.query),
                        baseUrl:req.protocol+'://'+req.hostname,
                        config:config,
                        lang:user.lang,
                        $user:user,
                        monitors:r
                    });
                })
            },res,req)
        });
        //MJPEG feed
        // if query string `full=true` is not present then it will load the MJPEG data directly and not the iframe ready page.
        app.get(['/:auth/mjpeg/:ke/:id','/:auth/mjpeg/:ke/:id/:channel'], function(req,res) {
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            if(req.query.full=='true'){
                res.render('mjpeg',{url:'/'+req.params.auth+'/mjpeg/'+req.params.ke+'/'+req.params.id});
                res.end()
            }else{
                s.auth(req.params,function(user){
                    if(s.group[req.params.ke]&&s.group[req.params.ke].mon[req.params.id]){
                        if(user.permissions.watch_stream==="0"||user.details.sub&&user.details.allmonitors!=='1'&&user.details.monitors.indexOf(req.params.id)===-1){
                            res.end(user.lang['Not Permitted'])
                            return
                        }

                        var Emitter
                        if(!req.params.channel){
                            Emitter = s.group[req.params.ke].mon[req.params.id].emitter
                        }else{
                            Emitter = s.group[req.params.ke].mon[req.params.id].emitterChannel[parseInt(req.params.channel)+config.pipeAddition]
                        }
                        res.writeHead(200, {
                        'Content-Type': 'multipart/x-mixed-replace; boundary=shinobi',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'Pragma': 'no-cache'
                        });
                        var contentWriter,content = fs.readFileSync(config.defaultMjpeg,'binary');
                        res.write("--shinobi\r\n");
                        res.write("Content-Type: image/jpeg\r\n");
                        res.write("Content-Length: " + content.length + "\r\n");
                        res.write("\r\n");
                        res.write(content,'binary');
                        res.write("\r\n");
                        Emitter.on('data',contentWriter=function(d){
                            content = d;
                            res.write(content,'binary');
                        })
                        res.on('close', function () {
                            Emitter.removeListener('data',contentWriter)
                        });
                    }else{
                        res.end();
                    }
                },res,req);
            }
        });
        //embed monitor
        app.get(['/:auth/embed/:ke/:id','/:auth/embed/:ke/:id/:addon'], function (req,res){
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            req.params.protocol=req.protocol;
            s.auth(req.params,function(user){
                if(user.permissions.watch_stream==="0"||user.details.sub&&user.details.allmonitors!=='1'&&user.details.monitors.indexOf(req.params.id)===-1){
                    res.end(user.lang['Not Permitted'])
                    return
                }
                if(s.group[req.params.ke]&&s.group[req.params.ke].mon[req.params.id]){
                    if(s.group[req.params.ke].mon[req.params.id].started===1){
                        req.params.uid=user.uid;
                        res.render("embed",{data:req.params,baseUrl:req.protocol+'://'+req.hostname,config:config,lang:user.lang,mon:CircularJSON.parse(CircularJSON.stringify(s.group[req.params.ke].mon_conf[req.params.id]))});
                        res.end()
                    }else{
                        res.end(user.lang['Cannot watch a monitor that isn\'t running.'])
                    }
                }else{
                    res.end(user.lang['No Monitor Exists with this ID.'])
                }
            },res,req);
        });
        // Get TV Channels (Monitor Streams) json
        app.get(['/:auth/tvChannels/:ke','/:auth/tvChannels/:ke/:id','/get.php'], function (req,res){
            req.ret={ok:false};
            if(req.query.username&&req.query.password){
                req.params.username = req.query.username
                req.params.password = req.query.password
            }
            var output = ['h264','hls','mp4']
            if(req.query.output&&req.query.output!==''){
                output = req.query.output.split(',')
                output.forEach(function(type,n){
                    if(type==='ts'){
                        output[n]='h264'
                        if(output.indexOf('hls')===-1){
                            output.push('hls')
                        }
                    }
                })
            }
            var isM3u8 = false;
            if(req.query.type==='m3u8'||req.query.type==='m3u_plus'){
                //is m3u8
                isM3u8 = true;
            }else{
                res.setHeader('Content-Type', 'application/json');
            }
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            req.fn=function(user){
                if(user.permissions.get_monitors==="0"){
                    res.end(s.s([]))
                    return
                }
                if(!req.params.ke){
                    req.params.ke = user.ke;
                }
                if(req.query.id&&!req.params.id){
                    req.params.id = req.query.id;
                }
                req.sql='SELECT * FROM Monitors WHERE mode!=? AND ke=?';req.ar=['stop',req.params.ke];
                if(!req.params.id){
                    if(user.details.sub&&user.details.monitors&&user.details.allmonitors!=='1'){
                        try{user.details.monitors=JSON.parse(user.details.monitors);}catch(er){}
                        req.or=[];
                        user.details.monitors.forEach(function(v,n){
                            req.or.push('mid=?');req.ar.push(v)
                        })
                        req.sql+=' AND ('+req.or.join(' OR ')+')'
                    }
                }else{
                    if(!user.details.sub||user.details.allmonitors!=='0'||user.details.monitors.indexOf(req.params.id)>-1){
                        req.sql+=' and mid=?';req.ar.push(req.params.id)
                    }else{
                        res.end('[]');
                        return;
                    }
                }
                s.sqlQuery(req.sql,req.ar,function(err,r){
                    var tvChannelMonitors = [];
                    r.forEach(function(v,n){
                        var buildStreamURL = function(channelRow,type,channelNumber){
                            var streamURL
                            if(channelNumber){channelNumber = '/'+channelNumber}else{channelNumber=''}
                            switch(type){
                                case'mjpeg':
                                    streamURL='/'+req.params.auth+'/mjpeg/'+v.ke+'/'+v.mid+channelNumber
                                break;
                                case'hls':
                                    streamURL='/'+req.params.auth+'/hls/'+v.ke+'/'+v.mid+channelNumber+'/s.m3u8'
                                break;
                                case'h264':
                                    streamURL='/'+req.params.auth+'/h264/'+v.ke+'/'+v.mid+channelNumber
                                break;
                                case'flv':
                                    streamURL='/'+req.params.auth+'/flv/'+v.ke+'/'+v.mid+channelNumber+'/s.flv'
                                break;
                                case'mp4':
                                    streamURL='/'+req.params.auth+'/mp4/'+v.ke+'/'+v.mid+channelNumber+'/s.ts'
                                break;
                            }
                            if(streamURL){
                                if(!channelRow.streamsSortedByType[type]){
                                    channelRow.streamsSortedByType[type]=[]
                                }
                                channelRow.streamsSortedByType[type].push(streamURL)
                                channelRow.streams.push(streamURL)
                            }
                            return streamURL
                        }
                        var details = JSON.parse(r[n].details);
                        if(!details.tv_channel_id||details.tv_channel_id==='')details.tv_channel_id = 'temp_'+misc.gid(5)
                        var channelRow = {
                            ke:v.ke,
                            mid:v.mid,
                            type:v.type,
                            groupTitle:details.tv_channel_group_title,
                            channel:details.tv_channel_id,
                        };
                        if(details.snap==='1'){
                            channelRow.snapshot = '/'+req.params.auth+'/jpeg/'+v.ke+'/'+v.mid+'/s.jpg'
                        }
                        channelRow.streams=[]
                        channelRow.streamsSortedByType={}
                        buildStreamURL(channelRow,details.stream_type)
                        if(details.stream_channels&&details.stream_channels!==''){
                            details.stream_channels=JSON.parse(details.stream_channels)
                            details.stream_channels.forEach(function(b,m){
                                buildStreamURL(channelRow,b.stream_type,m.toString())
                            })
                        }
                        if(details.tv_channel==='1'){
                            tvChannelMonitors.push(channelRow)
                        }
                    })
                    if(isM3u8){
                        var m3u8 = '#EXTM3U'+'\n'
                        tvChannelMonitors.forEach(function(channelRow,n){
                        output.forEach(function(type){
                            if(channelRow.streamsSortedByType[type]){
                                if(req.query.type==='m3u_plus'){
                                    m3u8 +='#EXTINF-1 tvg-id="'+channelRow.mid+'" tvg-name="'+channelRow.channel+'" tvg-logo="'+req.protocol+'://'+req.headers.host+channelRow.snapshot+'" group-title="'+channelRow.groupTitle+'",'+channelRow.channel+'\n'
                                }else{
                                    m3u8 +='#EXTINF:-1,'+channelRow.channel+' ('+type.toUpperCase()+') \n'
                                }
                                m3u8 += req.protocol+'://'+req.headers.host+channelRow.streamsSortedByType[type][0]+'\n'
                            }
                        })
                        })
                        res.end(m3u8)
                    }else{
                        if(tvChannelMonitors.length===1){tvChannelMonitors=tvChannelMonitors[0];}
                        res.end(s.s(tvChannelMonitors, null, 3));
                    }
                })
            }
            s.auth(req.params,req.fn,res,req);
        });
        // Get monitors json
        app.get(['/:auth/monitor/:ke','/:auth/monitor/:ke/:id'], function (req,res){
            req.ret={ok:false};
            res.setHeader('Content-Type', 'application/json');
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            req.fn=function(user){
            if(user.permissions.get_monitors==="0"){
                res.end(s.s([]))
                return
            }
                req.sql='SELECT * FROM Monitors WHERE ke=?';req.ar=[req.params.ke];
                if(!req.params.id){
                    if(user.details.sub&&user.details.monitors&&user.details.allmonitors!=='1'){
                        try{user.details.monitors=JSON.parse(user.details.monitors);}catch(er){}
                        req.or=[];
                        user.details.monitors.forEach(function(v,n){
                            req.or.push('mid=?');req.ar.push(v)
                        })
                        req.sql+=' AND ('+req.or.join(' OR ')+')'
                    }
                }else{
                    if(!user.details.sub||user.details.allmonitors!=='0'||user.details.monitors.indexOf(req.params.id)>-1){
                        req.sql+=' and mid=?';req.ar.push(req.params.id)
                    }else{
                        res.end('[]');
                        return;
                    }
                }
                s.sqlQuery(req.sql,req.ar,function(err,r){
                    r.forEach(function(v,n){
                        if(s.group[v.ke]&&s.group[v.ke].mon[v.mid]&&s.group[v.ke].mon[v.mid].watch){
                            r[n].currentlyWatching=Object.keys(s.group[v.ke].mon[v.mid].watch).length
                        }
                        r[n].subStream={}
                        var details = JSON.parse(r[n].details)
                        if(details.snap==='1'){
                            r[n].subStream.jpeg = '/'+req.params.auth+'/jpeg/'+v.ke+'/'+v.mid+'/s.jpg'
                        }
                        if(details.stream_channels&&details.stream_channels!==''){
                            try{
                                details.stream_channels=JSON.parse(details.stream_channels)
                                r[n].channels=[]
                                details.stream_channels.forEach(function(b,m){
                                    var streamURL
                                    switch(b.stream_type){
                                        case'mjpeg':
                                            streamURL='/'+req.params.auth+'/mjpeg/'+v.ke+'/'+v.mid+'/'+m
                                        break;
                                        case'hls':
                                            streamURL='/'+req.params.auth+'/hls/'+v.ke+'/'+v.mid+'/'+m+'/s.m3u8'
                                        break;
                                        case'h264':
                                            streamURL='/'+req.params.auth+'/h264/'+v.ke+'/'+v.mid+'/'+m
                                        break;
                                        case'flv':
                                            streamURL='/'+req.params.auth+'/flv/'+v.ke+'/'+v.mid+'/'+m+'/s.flv'
                                        break;
                                        case'mp4':
                                            streamURL='/'+req.params.auth+'/mp4/'+v.ke+'/'+v.mid+'/'+m+'/s.mp4'
                                        break;
                                    }
                                    r[n].channels.push(streamURL)
                                })
                            }catch(err){
                                logging.log(req.params,{type:'Broken Monitor Object',msg:'Stream Channels Field is damaged. Skipping.'})
                            }
                        }
                    })
                    if(r.length===1){r=r[0];}
                    res.end(s.s(r, null, 3));
                })
            }
            s.auth(req.params,req.fn,res,req);
        });
        // Get videos json
        app.get(['/:auth/videos/:ke','/:auth/videos/:ke/:id'], function (req,res){
            res.setHeader('Content-Type', 'application/json');
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            s.auth(req.params,function(user){
                if(user.permissions.watch_videos==="0"||user.details.sub&&user.details.allmonitors!=='1'&&user.details.video_view.indexOf(req.params.id)===-1){
                    res.end(s.s([]))
                    return
                }
                req.sql='SELECT * FROM Videos WHERE ke=?';req.ar=[req.params.ke];
                req.count_sql='SELECT COUNT(*) FROM Videos WHERE ke=?';req.count_ar=[req.params.ke];
                if(req.query.archived=='1'){
                    req.sql+=' AND details LIKE \'%"archived":"1"\''
                    req.count_sql+=' AND details LIKE \'%"archived":"1"\''
                }
                if(!req.params.id){
                    if(user.details.sub&&user.details.monitors&&user.details.allmonitors!=='1'){
                        try{user.details.monitors=JSON.parse(user.details.monitors);}catch(er){}
                        req.or=[];
                        user.details.monitors.forEach(function(v,n){
                            req.or.push('mid=?');req.ar.push(v)
                        })
                        req.sql+=' AND ('+req.or.join(' OR ')+')'
                        req.count_sql+=' AND ('+req.or.join(' OR ')+')'
                    }
                }else{
                    if(!user.details.sub||user.details.allmonitors!=='0'||user.details.monitors.indexOf(req.params.id)>-1){
                        req.sql+=' and mid=?';req.ar.push(req.params.id)
                        req.count_sql+=' and mid=?';req.count_ar.push(req.params.id)
                    }else{
                        res.end('[]');
                        return;
                    }
                }
                if(req.query.start||req.query.end){
                    if(!req.query.startOperator||req.query.startOperator==''){
                        req.query.startOperator='>='
                    }
                    if(!req.query.endOperator||req.query.endOperator==''){
                        req.query.endOperator='<='
                    }
                    switch(true){
                        case(req.query.start&&req.query.start!==''&&req.query.end&&req.query.end!==''):
                            req.query.start=req.query.start.replace('T',' ')
                            req.query.end=req.query.end.replace('T',' ')
                            req.sql+=' AND `time` '+req.query.startOperator+' ? AND `end` '+req.query.endOperator+' ?';
                            req.count_sql+=' AND `time` '+req.query.startOperator+' ? AND `end` '+req.query.endOperator+' ?';
                            req.ar.push(req.query.start)
                            req.ar.push(req.query.end)
                            req.count_ar.push(req.query.start)
                            req.count_ar.push(req.query.end)
                        break;
                        case(req.query.start&&req.query.start!==''):
                            req.query.start=req.query.start.replace('T',' ')
                            req.sql+=' AND `time` '+req.query.startOperator+' ?';
                            req.count_sql+=' AND `time` '+req.query.startOperator+' ?';
                            req.ar.push(req.query.start)
                            req.count_ar.push(req.query.start)
                        break;
                        case(req.query.end&&req.query.end!==''):
                            req.query.end=req.query.end.replace('T',' ')
                            req.sql+=' AND `end` '+req.query.endOperator+' ?';
                            req.count_sql+=' AND `end` '+req.query.endOperator+' ?';
                            req.ar.push(req.query.end)
                            req.count_ar.push(req.query.end)
                        break;
                    }
                }
                req.sql+=' ORDER BY `time` DESC';
                if(!req.query.limit||req.query.limit==''){
                    req.query.limit='100'
                }
                if(req.query.limit!=='0'){
                    req.sql+=' LIMIT '+req.query.limit
                }
                s.sqlQuery(req.sql,req.ar,function(err,r){
                    if(!r){
                        res.end(s.s({total:0,limit:req.query.limit,skip:0,videos:[]}, null, 3));
                        return
                    }
                s.sqlQuery(req.count_sql,req.count_ar,function(err,count){
                    r.forEach(function(v){
                        v.href='/'+req.params.auth+'/videos/'+v.ke+'/'+v.mid+'/'+misc.moment(v.time)+'.'+v.ext;
                    })
                    if(req.query.limit.indexOf(',')>-1){
                        req.skip=parseInt(req.query.limit.split(',')[0])
                        req.query.limit=parseInt(req.query.limit.split(',')[0])
                    }else{
                        req.skip=0
                        req.query.limit=parseInt(req.query.limit)
                    }
                    res.end(s.s({total:count[0]['COUNT(*)'],limit:req.query.limit,skip:req.skip,videos:r}, null, 3));
                })
                })
            },res,req);
        });
        // Get events json (motion logs)
        app.get(['/:auth/events/:ke','/:auth/events/:ke/:id','/:auth/events/:ke/:id/:limit','/:auth/events/:ke/:id/:limit/:start','/:auth/events/:ke/:id/:limit/:start/:end'], function (req,res){
            req.ret={ok:false};
            res.setHeader('Content-Type', 'application/json');
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            s.auth(req.params,function(user){
                if(user.permissions.watch_videos==="0"||user.details.sub&&user.details.allmonitors!=='1'&&user.details.video_view.indexOf(req.params.id)===-1){
                    res.end(s.s([]))
                    return
                }
                req.sql='SELECT * FROM Events WHERE ke=?';req.ar=[req.params.ke];
                if(!req.params.id){
                    if(user.details.sub&&user.details.monitors&&user.details.allmonitors!=='1'){
                        try{user.details.monitors=JSON.parse(user.details.monitors);}catch(er){}
                        req.or=[];
                        user.details.monitors.forEach(function(v,n){
                            req.or.push('mid=?');req.ar.push(v)
                        })
                        req.sql+=' AND ('+req.or.join(' OR ')+')'
                    }
                }else{
                    if(!user.details.sub||user.details.allmonitors!=='0'||user.details.monitors.indexOf(req.params.id)>-1){
                        req.sql+=' and mid=?';req.ar.push(req.params.id)
                    }else{
                        res.end('[]');
                        return;
                    }
                }
                if(req.params.start&&req.params.start!==''){
                    req.params.start=req.params.start.replace('T',' ')
                    if(req.params.end&&req.params.end!==''){
                        req.params.end=req.params.end.replace('T',' ')
                        req.sql+=' AND `time` >= ? AND `time` <= ?';
                        req.ar.push(decodeURIComponent(req.params.start))
                        req.ar.push(decodeURIComponent(req.params.end))
                    }else{
                        req.sql+=' AND `time` >= ?';
                        req.ar.push(decodeURIComponent(req.params.start))
                    }
                }
                if(!req.params.limit||req.params.limit==''){req.params.limit=100}
                req.sql+=' ORDER BY `time` DESC LIMIT '+req.params.limit+'';
                s.sqlQuery(req.sql,req.ar,function(err,r){
                    if(err){
                        err.sql=req.sql;
                        res.end(s.s(err, null, 3));
                        return
                    }
                    if(!r){r=[]}
                    r.forEach(function(v,n){
                        r[n].details=JSON.parse(v.details);
                    })
                    res.end(s.s(r, null, 3));
                })
            },res,req);
        });
        // Get logs json
        app.get(['/:auth/logs/:ke','/:auth/logs/:ke/:id'], function (req,res){
            req.ret={ok:false};
            res.setHeader('Content-Type', 'application/json');
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            s.auth(req.params,function(user){
                if(user.permissions.get_logs==="0"){
                    res.end(s.s([]))
                    return
                }
                req.sql='SELECT * FROM Logs WHERE ke=?';req.ar=[req.params.ke];
                if(!req.params.id){
                    if(user.details.sub&&user.details.monitors&&user.details.allmonitors!=='1'){
                        try{user.details.monitors=JSON.parse(user.details.monitors);}catch(er){}
                        req.or=[];
                        user.details.monitors.forEach(function(v,n){
                            req.or.push('mid=?');req.ar.push(v)
                        })
                        req.sql+=' AND ('+req.or.join(' OR ')+')'
                    }
                }else{
                    if(!user.details.sub||user.details.allmonitors!=='0'||user.details.monitors.indexOf(req.params.id)>-1||req.params.id.indexOf('$')>-1){
                        req.sql+=' and mid=?';req.ar.push(req.params.id)
                    }else{
                        res.end('[]');
                        return;
                    }
                }
                if(!req.query.limit||req.query.limit==''){req.query.limit=50}
                req.sql+=' ORDER BY `time` DESC LIMIT '+req.query.limit+'';
                s.sqlQuery(req.sql,req.ar,function(err,r){
                    if(err){
                        err.sql=req.sql;
                        res.end(s.s(err, null, 3));
                        return
                    }
                    if(!r){r=[]}
                    r.forEach(function(v,n){
                        r[n].info=JSON.parse(v.info)
                    })
                    res.end(s.s(r, null, 3));
                })
            },res,req);
        });
        // Get monitors online json
        app.get('/:auth/smonitor/:ke', function (req,res){
            req.ret={ok:false};
            res.setHeader('Content-Type', 'application/json');
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            req.fn=function(user){
                if(user.permissions.get_monitors==="0"){
                    res.end(s.s([]))
                    return
                }
                req.sql='SELECT * FROM Monitors WHERE ke=?';req.ar=[req.params.ke];
                if(user.details.sub&&user.details.monitors&&user.details.allmonitors!=='1'){
                    try{user.details.monitors=JSON.parse(user.details.monitors);}catch(er){}
                    req.or=[];
                    user.details.monitors.forEach(function(v,n){
                        req.or.push('mid=?');req.ar.push(v)
                    })
                    req.sql+=' AND ('+req.or.join(' OR ')+')'
                }
                s.sqlQuery(req.sql,req.ar,function(err,r){
                    if(r&&r[0]){
                        req.ar=[];
                        r.forEach(function(v){
                            if(s.group[req.params.ke]&&s.group[req.params.ke].mon[v.mid]&&s.group[req.params.ke].mon[v.mid].started===1){
                                req.ar.push(v)
                            }
                        })
                    }else{
                        req.ar=[];
                    }
                    res.end(s.s(req.ar, null, 3));
                })
            }
            s.auth(req.params,req.fn,res,req);
        });
        // Monitor Add,Edit,Delete
        app.all(['/:auth/configureMonitor/:ke/:id','/:auth/configureMonitor/:ke/:id/:f'], function (req,res){
            req.ret={ok:false};
            res.setHeader('Content-Type', 'application/json');
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            s.auth(req.params,function(user){
                if(req.params.f!=='delete'){
                    if(!req.body.data&&!req.query.data){
                        req.ret.msg='No Monitor Data found.'
                        res.end(s.s(req.ret, null, 3))
                        return
                    }
                    try{
                        if(req.query.data){
                            req.monitor=JSON.parse(req.query.data)
                        }else{
                            req.monitor=JSON.parse(req.body.data)
                        }
                    }catch(er){
                        if(!req.monitor){
                            req.ret.msg=user.lang.monitorEditText1;
                            res.end(s.s(req.ret, null, 3))
                        }
                        return
                    }
                    if(!user.details.sub||user.details.allmonitors==='1'||user.details.monitor_edit.indexOf(req.monitor.mid)>-1){
                            if(req.monitor&&req.monitor.mid&&req.monitor.name){
                                req.set=[],req.ar=[];
                                req.monitor.mid=req.params.id.replace(/[^\w\s]/gi,'').replace(/ /g,'');
                                try{
                                    JSON.parse(req.monitor.details)
                                }catch(er){
                                    if(!req.monitor.details||!req.monitor.details.stream_type){
                                        req.ret.msg=user.lang.monitorEditText2;
                                        res.end(s.s(req.ret, null, 3))
                                        return
                                    }else{
                                        req.monitor.details=JSON.stringify(req.monitor.details)
                                    }
                                }
                                req.monitor.ke=req.params.ke
                                req.logObject={details:JSON.parse(req.monitor.details),ke:req.params.ke,mid:req.params.id}
                                s.sqlQuery('SELECT * FROM Monitors WHERE ke=? AND mid=?',[req.monitor.ke,req.monitor.mid],function(er,r){
                                    req.tx={f:'monitor_edit',mid:req.monitor.mid,ke:req.monitor.ke,mon:req.monitor};
                                    if(r&&r[0]){
                                        req.tx.new=false;
                                        Object.keys(req.monitor).forEach(function(v){
                                            if(req.monitor[v]&&req.monitor[v]!==''){
                                                req.set.push(v+'=?'),req.ar.push(req.monitor[v]);
                                            }
                                        })
                                        req.set=req.set.join(',');
                                        req.ar.push(req.monitor.ke),req.ar.push(req.monitor.mid);
                                        logging.log(req.monitor,{type:'Monitor Updated',msg:'by user : '+user.uid});
                                        req.ret.msg=user.lang['Monitor Updated by user']+' : '+user.uid;
                                        s.sqlQuery('UPDATE Monitors SET '+req.set+' WHERE ke=? AND mid=?',req.ar)
                                        req.finish=1;
                                    }else{
                                        if(!s.group[req.monitor.ke].init.max_camera||s.group[req.monitor.ke].init.max_camera==''||Object.keys(s.group[req.monitor.ke].mon).length <= parseInt(s.group[req.monitor.ke].init.max_camera)){
                                            req.tx.new=true;
                                            req.st=[];
                                            Object.keys(req.monitor).forEach(function(v){
                                                if(req.monitor[v]&&req.monitor[v]!==''){
                                                    req.set.push(v),req.st.push('?'),req.ar.push(req.monitor[v]);
                                                }
                                            })
                //                                        req.set.push('ke'),req.st.push('?'),req.ar.push(req.monitor.ke);
                                            req.set=req.set.join(','),req.st=req.st.join(',');
                                            logging.log(req.monitor,{type:'Monitor Added',msg:'by user : '+user.uid});
                                            req.ret.msg=user.lang['Monitor Added by user']+' : '+user.uid;
                                            s.sqlQuery('INSERT INTO Monitors ('+req.set+') VALUES ('+req.st+')',req.ar)
                                            req.finish=1;
                                        }else{
                                            req.tx.f='monitor_edit_failed';
                                            req.tx.ff='max_reached';
                                            req.ret.msg=user.lang.monitorEditFailedMaxReached;
                                        }
                                    }
                                    if(req.finish===1){
                                        req.monitor.details=JSON.parse(req.monitor.details)
                                        req.ret.ok=true;
                                        s.init(0,{mid:req.monitor.mid,ke:req.monitor.ke});
                                        s.group[req.monitor.ke].mon_conf[req.monitor.mid]=s.init('noReference',req.monitor);
                                        if(req.monitor.mode==='stop'){
                                            camera.camera('stop',req.monitor);
                                        }else{
                                            camera.camera('stop',req.monitor);setTimeout(function(){camera.camera(req.monitor.mode,req.monitor);},5000)
                                        };
                                        misc.tx(req.tx,'STR_'+req.monitor.ke);
                                    };
                                    misc.tx(req.tx,'GRP_'+req.monitor.ke);
                                    res.end(s.s(req.ret, null, 3))
                                })
                            }else{
                                req.ret.msg=user.lang.monitorEditText1;
                                res.end(s.s(req.ret, null, 3))
                            }
                    }else{
                            req.ret.msg=user.lang['Not Permitted'];
                            res.end(s.s(req.ret, null, 3))
                    }
                }else{
                    if(!user.details.sub||user.details.allmonitors==='1'||user.details.monitor_edit.indexOf(req.params.id)>-1){
                        logging.log(s.group[req.params.ke].mon_conf[req.params.id],{type:'Monitor Deleted',msg:'by user : '+user.uid});
                        req.params.delete=1;camera.camera('stop',req.params);
                        misc.tx({f:'monitor_delete',uid:user.uid,mid:req.params.id,ke:req.params.ke},'GRP_'+req.params.ke);
                        s.sqlQuery('DELETE FROM Monitors WHERE ke=? AND mid=?',[req.params.ke,req.params.id])
                        req.ret.ok=true;
                        req.ret.msg='Monitor Deleted by user : '+user.uid
                        res.end(s.s(req.ret, null, 3))
                    }
                }
            })
        })
        app.get(['/:auth/monitor/:ke/:id/:f','/:auth/monitor/:ke/:id/:f/:ff','/:auth/monitor/:ke/:id/:f/:ff/:fff'], function (req,res){
            req.ret={ok:false};
            res.setHeader('Content-Type', 'application/json');
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            s.auth(req.params,function(user){
                if(user.permissions.control_monitors==="0"||user.details.sub&&user.details.allmonitors!=='1'&&user.details.monitor_edit.indexOf(req.params.id)===-1){
                    res.end(user.lang['Not Permitted'])
                    return
                }
                if(req.params.f===''){req.ret.msg=user.lang.monitorGetText1;res.end(s.s(req.ret, null, 3));return}
                if(req.params.f!=='stop'&&req.params.f!=='start'&&req.params.f!=='record'){
                    req.ret.msg='Mode not recognized.';
                    res.end(s.s(req.ret, null, 3));
                    return;
                }
                s.sqlQuery('SELECT * FROM Monitors WHERE ke=? AND mid=?',[req.params.ke,req.params.id],function(err,r){
                    if(r&&r[0]){
                        r=r[0];
                        if(req.query.reset==='1'||(s.group[r.ke]&&s.group[r.ke].mon_conf[r.mid].mode!==req.params.f)||req.query.fps&&(!s.group[r.ke].mon[r.mid].currentState||!s.group[r.ke].mon[r.mid].currentState.trigger_on)){
                            if(req.query.reset!=='1'||!s.group[r.ke].mon[r.mid].trigger_timer){
                                if(!s.group[r.ke].mon[r.mid].currentState)s.group[r.ke].mon[r.mid].currentState={}
                                s.group[r.ke].mon[r.mid].currentState.mode=r.mode.toString()
                                s.group[r.ke].mon[r.mid].currentState.fps=r.fps.toString()
                                if(!s.group[r.ke].mon[r.mid].currentState.trigger_on){
                                s.group[r.ke].mon[r.mid].currentState.trigger_on=true
                                }else{
                                    s.group[r.ke].mon[r.mid].currentState.trigger_on=false
                                }
                                r.mode=req.params.f;
                                try{r.details=JSON.parse(r.details);}catch(er){}
                                if(req.query.fps){
                                    r.fps=parseFloat(r.details.detector_trigger_record_fps)
                                    s.group[r.ke].mon[r.mid].currentState.detector_trigger_record_fps=r.fps
                                }
                                r.id=r.mid;
                                s.sqlQuery('UPDATE Monitors SET mode=? WHERE ke=? AND mid=?',[r.mode,r.ke,r.mid]);
                                s.group[r.ke].mon_conf[r.mid]=r;
                                misc.tx({f:'monitor_edit',mid:r.mid,ke:r.ke,mon:r},'GRP_'+r.ke);
                                misc.tx({f:'monitor_edit',mid:r.mid,ke:r.ke,mon:r},'STR_'+r.ke);
                                camera.camera('stop',s.init('noReference',r));
                                if(req.params.f!=='stop'){
                                    camera.camera(req.params.f,s.init('noReference',r));
                                }
                                req.ret.msg=user.lang['Monitor mode changed']+' : '+req.params.f;
                            }else{
                                req.ret.msg=user.lang['Reset Timer'];
                            }
                            req.ret.cmd_at=misc.moment(new Date,'YYYY-MM-DD HH:mm:ss');
                            req.ret.ok=true;
                            if(req.params.ff&&req.params.f!=='stop'){
                                req.params.ff=parseFloat(req.params.ff);
                                clearTimeout(s.group[r.ke].mon[r.mid].trigger_timer)
                                switch(req.params.fff){
                                    case'day':case'days':
                                        req.timeout=req.params.ff*1000*60*60*24
                                    break;
                                    case'hr':case'hour':case'hours':
                                        req.timeout=req.params.ff*1000*60*60
                                    break;
                                    case'min':case'minute':case'minutes':
                                        req.timeout=req.params.ff*1000*60
                                    break;
                                    default://seconds
                                        req.timeout=req.params.ff*1000
                                    break;
                                }
                                s.group[r.ke].mon[r.mid].trigger_timer=setTimeout(function(){
                                    delete(s.group[r.ke].mon[r.mid].trigger_timer)
                                    s.sqlQuery('UPDATE Monitors SET mode=? WHERE ke=? AND mid=?',[s.group[r.ke].mon[r.mid].currentState.mode,r.ke,r.mid]);
                                    r.neglectTriggerTimer=1;
                                    r.mode=s.group[r.ke].mon[r.mid].currentState.mode;
                                    r.fps=s.group[r.ke].mon[r.mid].currentState.fps;
                                    camera.camera('stop',s.init('noReference',r),function(){
                                        if(s.group[r.ke].mon[r.mid].currentState.mode!=='stop'){
                                            camera.camera(s.group[r.ke].mon[r.mid].currentState.mode,s.init('noReference',r));
                                        }
                                        s.group[r.ke].mon_conf[r.mid]=r;
                                    });
                                    misc.tx({f:'monitor_edit',mid:r.mid,ke:r.ke,mon:r},'GRP_'+r.ke);
                                    misc.tx({f:'monitor_edit',mid:r.mid,ke:r.ke,mon:r},'STR_'+r.ke);
                                },req.timeout);
        //                        req.ret.end_at=misc.moment(new Date,'YYYY-MM-DD HH:mm:ss').add(req.timeout,'milliseconds');
                            }
                        }else{
                            req.ret.msg=user.lang['Monitor mode is already']+' : '+req.params.f;
                        }
                    }else{
                        req.ret.msg=user.lang['Monitor or Key does not exist.'];
                    }
                    res.end(s.s(req.ret, null, 3));
                })
            },res,req);
        })
        //get file from fileBin bin
        app.get(['/:auth/fileBin/:ke','/:auth/fileBin/:ke/:id'],function (req,res){
            res.setHeader('Content-Type', 'application/json');
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            req.fn=function(user){
                req.sql='SELECT * FROM Files WHERE ke=?';req.ar=[req.params.ke];
                if(user.details.sub&&user.details.monitors&&user.details.allmonitors!=='1'){
                    try{user.details.monitors=JSON.parse(user.details.monitors);}catch(er){}
                    req.or=[];
                    user.details.monitors.forEach(function(v,n){
                        req.or.push('mid=?');req.ar.push(v)
                    })
                    req.sql+=' AND ('+req.or.join(' OR ')+')'
                }else{
                    if(req.params.id&&(!user.details.sub||user.details.allmonitors!=='0'||user.details.monitors.indexOf(req.params.id)>-1)){
                        req.sql+=' and mid=?';req.ar.push(req.params.id)
                    }
                }
                s.sqlQuery(req.sql,req.ar,function(err,r){
                    if(!r){
                        r=[]
                    }else{
                        r.forEach(function(v){
                            v.details=JSON.parse(v.details)
                            v.href='/'+req.params.auth+'/fileBin/'+req.params.ke+'/'+req.params.id+'/'+v.details.year+'/'+v.details.month+'/'+v.details.day+'/'+v.name;
                        })
                    }
                    res.end(s.s(r, null, 3));
                })
            }
            s.auth(req.params,req.fn,res,req);
        });
        //get file from fileBin bin
        app.get('/:auth/fileBin/:ke/:id/:year/:month/:day/:file', function (req,res){
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            req.fn=function(user){
                req.failed=function(){
                    res.end(user.lang['File Not Found'])
                }
                if (!s.group[req.params.ke].fileBin[req.params.id+'/'+req.params.file]){
                    s.sqlQuery('SELECT * FROM Files WHERE ke=? AND mid=? AND name=?',[req.params.ke,req.params.id,req.params.file],function(err,r){
                        if(r&&r[0]){
                            r=r[0]
                            r.details=JSON.parse(r.details)
                            req.dir=s.dir.fileBin+req.params.ke+'/'+req.params.id+'/'+r.details.year+'/'+r.details.month+'/'+r.details.day+'/'+req.params.file;
                            if(fs.existsSync(req.dir)){
                                res.on('finish',function(){res.end();});
                                fs.createReadStream(req.dir).pipe(res);
                            }else{
                                req.failed()
                            }
                        }else{
                            req.failed()
                        }
                    })
                }else{
                    res.end(user.lang['Please Wait for Completion'])
                }
            }
            s.auth(req.params,req.fn,res,req);
        });
        // Get video file
        app.get('/:auth/videos/:ke/:id/:file', function (req,res){
            s.auth(req.params,function(user){
                if(user.permissions.watch_videos==="0"||user.details.sub&&user.details.allmonitors!=='1'&&user.details.monitors.indexOf(req.params.id)===-1){
                    res.end(user.lang['Not Permitted'])
                    return
                }
                s.sqlQuery('SELECT * FROM Videos WHERE ke=? AND mid=? AND time=?',[req.params.ke,req.params.id,misc.nameToTime(req.params.file)],function(err,r){
                    if(r&&r[0]){
                        req.dir=s.video('getDir',r[0])+req.params.file
                        if (fs.existsSync(req.dir)){
                            req.ext=req.params.file.split('.')[1];
                            var total = fs.statSync(req.dir).size;
                            if (req.headers['range']) {
                                var range = req.headers.range;
                                var parts = range.replace(/bytes=/, "").split("-");
                                var partialstart = parts[0];
                                var partialend = parts[1];

                                var start = parseInt(partialstart, 10);
                                var end = partialend ? parseInt(partialend, 10) : total-1;
                                var chunksize = (end-start)+1;
                                var file = fs.createReadStream(req.dir, {start: start, end: end});
                                req.headerWrite={ 'Content-Range': 'bytes ' + start + '-' + end + '/' + total, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': 'video/'+req.ext }
                                req.writeCode=206
                            } else {
                                req.headerWrite={ 'Content-Length': total, 'Content-Type': 'video/'+req.ext};
                                var file=fs.createReadStream(req.dir)
                                req.writeCode=200
                            }
                            if(req.query.downloadName){
                                req.headerWrite['content-disposition']='attachment; filename="'+req.query.downloadName+'"';
                            }
                            res.writeHead(req.writeCode,req.headerWrite);
                            file.on('close',function(){
                                res.end();
                            })
                            file.pipe(res);
                        }else{
                            res.end(user.lang['File Not Found'])
                        }
                    }else{
                        res.end(user.lang['File Not Found'])
                    }
                })
            },res,req);
        });
        //motion trigger
        app.get('/:auth/motion/:ke/:id', function (req,res){
            s.auth(req.params,function(user){
                if(req.query.data){
                    try{
                        var d={id:req.params.id,ke:req.params.ke,details:JSON.parse(req.query.data)};
                    }catch(err){
                        res.end('Data Broken',err);
                        return;
                    }
                }else{
                    res.end('No Data');
                    return;
                }
                if(!d.ke||!d.id||!s.group[d.ke]){
                    res.end(user.lang['No Group with this key exists']);
                    return;
                }
                camera.camera('motion',d,function(){
                    res.end(user.lang['Trigger Successful'])
                });
            },res,req);
        })
        //hookTester trigger
        app.get('/:auth/hookTester/:ke/:id', function (req,res){
            res.setHeader('Content-Type', 'application/json');
            s.auth(req.params,function(user){
                logging.log(req.params,{type:'Test',msg:'Hook Test'})
                res.end(s.s({ok:true},null,3))
            },res,req);
        })
        //control trigger
        app.get('/:auth/control/:ke/:id/:direction', function (req,res){
            res.setHeader('Content-Type', 'application/json');
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            s.auth(req.params,function(user){
                camera.camera('control',req.params,function(resp){
                    res.end(s.s(resp,null,3))
                });
            },res,req);
        })
        //modify video file
        app.get(['/:auth/videos/:ke/:id/:file/:mode','/:auth/videos/:ke/:id/:file/:mode/:f'], function (req,res){
            req.ret={ok:false};
            res.setHeader('Content-Type', 'application/json');
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            s.auth(req.params,function(user){
                if(user.permissions.watch_videos==="0"||user.details.sub&&user.details.allmonitors!=='1'&&user.details.video_delete.indexOf(req.params.id)===-1){
                    res.end(user.lang['Not Permitted'])
                    return
                }
                req.sql='SELECT * FROM Videos WHERE ke=? AND mid=? AND time=?';
                req.ar=[req.params.ke,req.params.id,misc.nameToTime(req.params.file)];
                s.sqlQuery(req.sql,req.ar,function(err,r){
                    if(r&&r[0]){
                        r=r[0];r.filename=misc.moment(r.time)+'.'+r.ext;
                        switch(req.params.mode){
                            case'fix':
                                req.ret.ok=true;
                                s.video('fix',r)
                            break;
                            case'status':
                                req.params.f=parseInt(req.params.f)
                                if(isNaN(req.params.f)||req.params.f===0){
                                    req.ret.msg='Not a valid value.';
                                }else{
                                    req.ret.ok=true;
                                    s.sqlQuery('UPDATE Videos SET status=? WHERE ke=? AND mid=? AND time=?',[req.params.f,req.params.ke,req.params.id,misc.nameToTime(req.params.file)])
                                    misc.tx({f:'video_edit',status:req.params.f,filename:r.filename,mid:r.mid,ke:r.ke,time:misc.nameToTime(r.filename),end:misc.moment(new Date,'YYYY-MM-DD HH:mm:ss')},'GRP_'+r.ke);
                                }
                            break;
                            case'delete':
                                req.ret.ok=true;
                                s.video('delete',r)
                            break;
                            default:
                                req.ret.msg=user.lang.modifyVideoText1;
                            break;
                        }
                    }else{
                        req.ret.msg=user.lang['No such file'];
                    }
                    res.end(s.s(req.ret, null, 3));
                })
            },res,req);
        })
        //ffmpeg pushed stream in here to make a pipe
        app.all(['/streamIn/:ke/:id','/streamIn/:ke/:id/:feed'], function (req, res) {
            var checkOrigin = function(search){return req.headers.host.indexOf(search)>-1}
            if(checkOrigin('127.0.0.1')){
                if(!req.params.feed){req.params.feed='1'}
                if(!s.group[req.params.ke].mon[req.params.id].streamIn[req.params.feed]){
                    s.group[req.params.ke].mon[req.params.id].streamIn[req.params.feed] = new events.EventEmitter().setMaxListeners(0)
                }
                //req.params.feed = Feed Number
                res.connection.setTimeout(0);
                req.on('data', function(buffer){
                    s.group[req.params.ke].mon[req.params.id].streamIn[req.params.feed].emit('data',buffer)
                });
                req.on('end',function(){
        //            console.log('streamIn closed',req.params);
                });
            }else{
                res.end('Local connection is only allowed.')
            }
        })
        //MP4 Stream
        app.get(['/:auth/mp4/:ke/:id/:channel/s.mp4','/:auth/mp4/:ke/:id/s.mp4','/:auth/mp4/:ke/:id/:channel/s.ts','/:auth/mp4/:ke/:id/s.ts'], function (req, res) {
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            s.auth(req.params,function(user){
                var Channel = 'MAIN'
                if(req.params.channel){
                    Channel = parseInt(req.params.channel)+config.pipeAddition
                }
                var mp4frag = s.group[req.params.ke].mon[req.params.id].mp4frag[Channel];
                if(!mp4frag){
                    res.status(503);
                    res.end('MP4 Stream is not enabled');
                }else{
                    var init = mp4frag.initialization;
                    if (!init) {
                        //browser may have requested init segment before it was ready
                        res.status(503);
                        res.end('resource not ready');
                    } else {
                        res.status(200);
                        res.write(init);
                        mp4frag.pipe(res);
                        res.on('close', () => {
                            mp4frag.unpipe(res);
                        });
                    }
                }
            });
        });
        //simulate RTSP over HTTP
        app.get([
            '/:auth/mpegts/:ke/:id/:feed/:file',
            '/:auth/mpegts/:ke/:id/:feed/',
            '/:auth/h264/:ke/:id/:feed/:file',
            '/:auth/h264/:ke/:id/:feed',
            '/:auth/h264/:ke/:id'
        ], function (req, res) {
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            s.auth(req.params,function(user){
                if(!req.query.feed){req.query.feed='1'}
                var Emitter
                if(!req.params.feed){
                    Emitter = s.group[req.params.ke].mon[req.params.id].streamIn[req.query.feed]
                }else{
                    Emitter = s.group[req.params.ke].mon[req.params.id].emitterChannel[parseInt(req.params.feed)+config.pipeAddition]
                }
                s.init('streamIn',req.params)
                var contentWriter
                var date = new Date();
                res.writeHead(200, {
                    'Date': date.toUTCString(),
                    'Connection': 'keep-alive',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Content-Type': 'video/mp4',
                    'Server': 'Shinobi H.264 Test Stream',
                });
                Emitter.on('data',contentWriter=function(buffer){
                    res.write(buffer)
                })
                res.on('close', function () {
                    Emitter.removeListener('data',contentWriter)
                })
            })
        });
        //FFprobe by API
        app.get('/:auth/probe/:ke',function (req,res){
            req.ret={ok:false};
            res.setHeader('Content-Type', 'application/json');
            res.header("Access-Control-Allow-Origin",req.headers.origin);
            s.auth(req.params,function(user){
                switch(req.query.action){
        //            case'stop':
        //                exec('kill -9 '+user.ffprobe.pid,{detatched: true})
        //            break;
                    default:
                        if(!req.query.url){
                            req.ret.error = 'Missing URL'
                            res.end(s.s(req.ret, null, 3));
                            return
                        }
                        if(user.ffprobe){
                            req.ret.error = 'Account is already probing'
                            res.end(s.s(req.ret, null, 3));
                            return
                        }
                        user.ffprobe=1;
                        if(req.query.flags==='default'){
                            req.query.flags = '-v quiet -print_format json -show_format -show_streams'
                        }else{
                            if(!req.query.flags){
                                req.query.flags = ''
                            }
                        }
                        req.probeCommand = ffmpeg.split(req.query.flags+' -i '+req.query.url).join(' ')
                        exec('ffprobe '+req.probeCommand+' | echo ',function(err,stdout,stderr){
                            delete(user.ffprobe)
                            if(err){
                            req.ret.error=(err)
                            }else{
                                req.ret.ok=true
                                req.ret.result = stdout+stderr
                            }
                            req.ret.probe = req.probeCommand
                            res.end(s.s(req.ret, null, 3));
                        })
                    break;
                }
            },res,req);
        })
    }
    return module;
}