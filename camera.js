//
// Shinobi
// Copyright (C) 2016 Moe Alam, moeiscool
//
//
// # Donate
//
// If you like what I am doing here and want me to continue please consider donating :)
// PayPal : paypal@m03.ca
//
process.on('uncaughtException', function (err) {
    console.error('Uncaught Exception occured!');
    console.error(err.stack);
});
var ffmpegPath = false;
try{
    ffmpegPath = require('ffmpeg-static').path;
}catch(err){
    console.log('No Static FFmpeg. Continuing.')
    //no static ffmpeg
}
var fs = require('fs');
var os = require('os');
var URL = require('url');
var path = require('path');
var mysql = require('mysql');
var moment = require('moment');
var request = require("request");
var express = require('express');
var app = express();
var appHTTPS = express();
var http = require('http');
var https = require('https');
var server = http.createServer(app);
var bodyParser = require('body-parser');
var CircularJSON = require('circular-json');
var ejs = require('ejs');
var io = new (require('socket.io'))();
var execSync = require('child_process').execSync;
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var socketIOclient = require('socket.io-client');
var crypto = require('crypto');
var webdav = require("webdav");
var jsonfile = require("jsonfile");
var connectionTester = require('connection-tester');
var events = require('events');
var Cam = require('onvif').Cam;
var knex = require('knex');
var Mp4Frag = require('mp4frag');
var P2P = require('pipe2pam');
var PamDiff = require('pam-diff');
var chokidar = require('chokidar');
var location = {}
location.super = __dirname+'/super.json'
location.config = __dirname+'/conf.json'
location.languages = __dirname+'/languages'
location.definitions = __dirname+'/definitions'
var config = require(location.config);
if(!config.productType){
    config.productType='CE'
}
if(!config.language){
    config.language='en_CA'
}
try{
    var lang = require(location.languages+'/'+config.language+'.json');
}catch(er){
    console.error(er)
    console.log('There was an error loading your language file.')
    var lang = require(location.languages+'/en_CA.json');
}
try{
    var definitions = require(location.definitions+'/'+config.language+'.json');
}catch(er){
    console.error(er)
    console.log('There was an error loading your language file.')
    var definitions = require(location.definitions+'/en_CA.json');
}
process.send = process.send || function () {};
if(config.mail){
    var nodemailer = require('nodemailer').createTransport(config.mail);
}
//config defaults
if(config.cpuUsageMarker===undefined){config.cpuUsageMarker='%Cpu'}
if(config.customCpuCommand===undefined){config.customCpuCommand=null}
if(config.autoDropCache===undefined){config.autoDropCache=true}
if(config.doSnapshot===undefined){config.doSnapshot=true}
if(config.restart===undefined){config.restart={}}
if(config.systemLog===undefined){config.systemLog=true}
if(config.deleteCorruptFiles===undefined){config.deleteCorruptFiles=true}
if(config.restart.onVideoNotExist===undefined){config.restart.onVideoNotExist=true}
if(config.ip===undefined||config.ip===''||config.ip.indexOf('0.0.0.0')>-1){config.ip='localhost'}else{config.bindip=config.ip};
if(config.cron===undefined)config.cron={};
if(config.cron.deleteOverMax===undefined)config.cron.deleteOverMax=true;
if(config.cron.deleteOverMaxOffset===undefined)config.cron.deleteOverMaxOffset=0.9;
if(config.pluginKeys===undefined)config.pluginKeys={};
if(config.databaseType===undefined){config.databaseType='mysql'}
if(config.databaseLogs===undefined){config.databaseLogs=false}
if(config.pipeAddition===undefined){config.pipeAddition=7}else{config.pipeAddition=parseInt(config.pipeAddition)}

s={factorAuth:{},child_help:false,totalmem:os.totalmem(),platform:os.platform(),s:JSON.stringify,isWin:(process.platform==='win32')};
s.__basedir = __dirname;
var misc = require('./js/misc')({s:s,config:config,io:io});
var ffmpeg = require('./js/ffmpeg')(s,config,misc);
var logging = require('./js/logging')(s,config,misc);
var camera = require('./js/camera')(s,config,ffmpeg,logging,lang,misc,nodemailer);
var connection = require('./js/connection')({s,config,logging,misc,camera,lang});
var screen = require('./js/screen')(s,config,misc,logging);
//load languages dynamically
s.loadedLanguages={}
s.loadedLanguages[config.language]=lang;
s.getLanguageFile=function(rule){
    if(rule&&rule!==''){
        var file=s.loadedLanguages[file]
        if(!file){
            try{
                s.loadedLanguages[rule]=require(location.languages+'/'+rule+'.json')
                file=s.loadedLanguages[rule]
            }catch(err){
                file=lang
            }
        }
    }else{
        file=lang
    }
    return file
}
//load defintions dynamically
s.loadedDefinitons={}
s.loadedDefinitons[config.language]=definitions;
s.getDefinitonFile=function(rule){
    if(rule&&rule!==''){
        var file=s.loadedDefinitons[file]
        if(!file){
            try{
                s.loadedDefinitons[rule]=require(location.definitions+'/'+rule+'.json')
                file=s.loadedDefinitons[rule]
            }catch(err){
                file=definitions
            }
        }
    }else{
        file=definitions
    }
    return file
}
var databaseOptions = {
  client: config.databaseType,
  connection: config.db,
}
if(databaseOptions.client.indexOf('sqlite')>-1){
    databaseOptions.client = 'sqlite3';
    databaseOptions.useNullAsDefault = true;
}
if(databaseOptions.client === 'sqlite3' && databaseOptions.connection.filename === undefined){
    databaseOptions.connection.filename = __dirname+"/shinobi.sqlite"
}
s.databaseEngine = knex(databaseOptions)
s.sqlQuery = function(query,values,onMoveOn,hideLog){
    if(!values){values=[]}
    if(typeof values === 'function'){
        var onMoveOn = values;
        var values = [];
    }
    if(!onMoveOn){onMoveOn=function(){}}
    return s.databaseEngine.raw(query,values)
        .asCallback(function(err,r){
            if(err&&config.databaseLogs){
                logging.systemLog('s.sqlQuery QUERY',query)
                logging.systemLog('s.sqlQuery ERROR',err)
            }
            if(onMoveOn)
                if(typeof onMoveOn === 'function'){
                    switch(databaseOptions.client){
                        case'sqlite3':
                            if(!r)r=[]
                        break;
                        default:
                            if(r)r=r[0]
                        break;
                    }
                    onMoveOn(err,r)
                }else{
                    console.log(onMoveOn)
                }
        })
}
if(databaseOptions.client === 'mysql'){
    s.sqlQuery('ALTER TABLE `Videos` ADD COLUMN `details` TEXT NULL DEFAULT NULL AFTER `status`;',function(err){
        if(err){
            logging.systemLog("Critical update 1/2 already applied");
        }
        s.sqlQuery("CREATE TABLE IF NOT EXISTS `Files` (`ke` varchar(50) NOT NULL,`mid` varchar(50) NOT NULL,`name` tinytext NOT NULL,`size` float NOT NULL DEFAULT '0',`details` text NOT NULL,`status` int(1) NOT NULL DEFAULT '0') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",function(err){
            if(err){
                logging.systemLog("Critical update 2/2 NOT applied, this could be bad");
            }else{
                logging.systemLog("Critical update 2/2 already applied");
            }
        },true);
    },true);
}
process.on('exit',ffmpeg.kill.bind(null,{cleanup:true}));
process.on('SIGINT',ffmpeg.kill.bind(null, {exit:true}));
//key for child servers
s.child_nodes={};
s.child_key='3123asdasdf1dtj1hjk23sdfaasd12asdasddfdbtnkkfgvesra3asdsd3123afdsfqw345';

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
console.log('NODE.JS version : '+execSync("node -v"))
//ffmpeg location
if(!config.ffmpegDir){
    if(ffmpegPath !== false){
        config.ffmpegDir = ffmpegPath
    }else{
        if(s.isWin===true){
            config.ffmpegDir = __dirname+'/ffmpeg/ffmpeg.exe'
        }else{
            config.ffmpegDir = 'ffmpeg'
        }
    }
}
s.ffmpegVersion=execSync(config.ffmpegDir+" -version").toString().split('Copyright')[0].replace('ffmpeg version','').trim()
console.log('FFMPEG version : '+s.ffmpegVersion)
if(s.ffmpegVersion.indexOf(': 2.')>-1){
    logging.systemLog('FFMPEG is too old : '+s.ffmpegVersion+', Needed : 3.2+',err)
    return
}
//directories
s.group={};
if(!config.windowsTempDir&&s.isWin===true){config.windowsTempDir='C:/Windows/Temp'}
if(!config.defaultMjpeg){config.defaultMjpeg=__dirname+'/web/libs/img/bg.jpg'}
//default stream folder check
if(!config.streamDir){
    if(s.isWin===false){
        config.streamDir='/dev/shm'
    }else{
        config.streamDir=config.windowsTempDir
    }
    if(!fs.existsSync(config.streamDir)){
        config.streamDir=__dirname+'/streams/'
    }else{
        config.streamDir+='/streams/'
    }
}
if(!config.videosDir){config.videosDir=__dirname+'/videos/'}
if(!config.binDir){config.binDir=__dirname+'/fileBin/'}
if(!config.addStorage){config.addStorage=[]}
s.dir={
    videos:misc.checkCorrectPathEnding(config.videosDir),
    streams:misc.checkCorrectPathEnding(config.streamDir),
    fileBin:misc.checkCorrectPathEnding(config.binDir),
    addStorage:config.addStorage,
    languages:location.languages+'/'
};
//streams dir
if(!fs.existsSync(s.dir.streams)){
    fs.mkdirSync(s.dir.streams);
}
//videos dir
if(!fs.existsSync(s.dir.videos)){
    fs.mkdirSync(s.dir.videos);
}
//fileBin dir
if(!fs.existsSync(s.dir.fileBin)){
    fs.mkdirSync(s.dir.fileBin);
}
//additional storage areas
s.dir.addStorage.forEach(function(v,n){
    v.path=misc.checkCorrectPathEnding(v.path)
    if(!fs.existsSync(v.path)){
        fs.mkdirSync(v.path);
    }
})
////Camera Controller
s.init=function(x,e,k,fn){
    if(!e){e={}}
    if(!k){k={}}
    switch(x){
        case 0://init camera
            if(!s.group[e.ke]){s.group[e.ke]={}};
            if(!s.group[e.ke].fileBin){s.group[e.ke].fileBin={}};
            if(!s.group[e.ke].mon){s.group[e.ke].mon={}}
            if(!s.group[e.ke].sizeChangeQueue){s.group[e.ke].sizeChangeQueue=[]}
            if(!s.group[e.ke].sizePurgeQueue){s.group[e.ke].sizePurgeQueue=[]}
            if(!s.group[e.ke].users){s.group[e.ke].users={}}
            if(!s.group[e.ke].mon[e.mid]){s.group[e.ke].mon[e.mid]={}}
            if(!s.group[e.ke].mon[e.mid].streamIn){s.group[e.ke].mon[e.mid].streamIn={}};
            if(!s.group[e.ke].mon[e.mid].emitterChannel){s.group[e.ke].mon[e.mid].emitterChannel={}};
            if(!s.group[e.ke].mon[e.mid].mp4frag){s.group[e.ke].mon[e.mid].mp4frag={}};
            if(!s.group[e.ke].mon[e.mid].firstStreamChunk){s.group[e.ke].mon[e.mid].firstStreamChunk={}};
            if(!s.group[e.ke].mon[e.mid].contentWriter){s.group[e.ke].mon[e.mid].contentWriter={}};
            if(!s.group[e.ke].mon[e.mid].eventBasedRecording){s.group[e.ke].mon[e.mid].eventBasedRecording={}};
            if(!s.group[e.ke].mon[e.mid].watch){s.group[e.ke].mon[e.mid].watch={}};
            if(!s.group[e.ke].mon[e.mid].fixingVideos){s.group[e.ke].mon[e.mid].fixingVideos={}};
            if(!s.group[e.ke].mon[e.mid].record){s.group[e.ke].mon[e.mid].record={yes:e.record}};
            if(!s.group[e.ke].mon[e.mid].started){s.group[e.ke].mon[e.mid].started=0};
            if(s.group[e.ke].mon[e.mid].delete){clearTimeout(s.group[e.ke].mon[e.mid].delete)}
            if(!s.group[e.ke].mon_conf){s.group[e.ke].mon_conf={}}
            s.init('apps',e)
        break;
        case'group':
            if(!s.group[e.ke]){
                s.group[e.ke]={}
            }
            if(!s.group[e.ke].init){
                s.group[e.ke].init={}
            }
            if(!e.limit||e.limit===''){e.limit=10000}else{e.limit=parseFloat(e.limit)}
            //save global space limit for group key (mb)
            s.group[e.ke].sizeLimit=e.limit;
            //save global used space as megabyte value
            s.group[e.ke].usedSpace=e.size/1000000;
            //emit the changes to connected users
            s.init('diskUsedEmit',e)
        break;
        case'apps':
            if(!s.group[e.ke].init){
                s.group[e.ke].init={};
            }
            if(!s.group[e.ke].webdav||!s.group[e.ke].sizeLimit){
                s.sqlQuery('SELECT * FROM Users WHERE ke=? AND details NOT LIKE ?',[e.ke,'%"sub"%'],function(ar,r){
                    if(r&&r[0]){
                        r=r[0];
                        ar=JSON.parse(r.details);
                        //owncloud/webdav
                        if(ar.webdav_user&&
                           ar.webdav_user!==''&&
                           ar.webdav_pass&&
                           ar.webdav_pass!==''&&
                           ar.webdav_url&&
                           ar.webdav_url!==''
                          ){
                            if(!ar.webdav_dir||ar.webdav_dir===''){
                                ar.webdav_dir='/';
                                if(ar.webdav_dir.slice(-1)!=='/'){ar.webdav_dir+='/';}
                            }
                            s.group[e.ke].webdav = webdav(
                                ar.webdav_url,
                                ar.webdav_user,
                                ar.webdav_pass
                            );
                        }
                        Object.keys(ar).forEach(function(v){
                            s.group[e.ke].init[v]=ar[v]
                        })
                    }
                });
            }
        break;
        case'sync':
            e.cn=Object.keys(s.child_nodes);
            e.cn.forEach(function(v){
                if(s.group[e.ke]){
                   misc.cx({f:'sync',sync:s.init('noReference',s.group[e.ke].mon[e.mid]),ke:e.ke,mid:e.mid},s.child_nodes[v].cnid);
                }
            });
        break;
        case'noReference':
            x={keys:Object.keys(e),ar:{}};
            x.keys.forEach(function(v){
                if(v!=='last_frame'&&v!=='record'&&v!=='spawn'&&v!=='running'&&(v!=='time'&&typeof e[v]!=='function')){x.ar[v]=e[v];}
            });
            return x.ar;
        break;
        case'url':
            //build a complete url from pieces
            e.authd='';
            if(e.details.muser&&e.details.muser!==''&&e.host.indexOf('@')===-1) {
                e.authd=e.details.muser+':'+e.details.mpass+'@';
            }
            if(e.port==80&&e.details.port_force!=='1'){e.porty=''}else{e.porty=':'+e.port}
            e.url=e.protocol+'://'+e.authd+e.host+e.porty+e.path;return e.url;
        break;
        case'url_no_path':
            e.authd='';
            if(!e.details.muser){e.details.muser=''}
            if(!e.details.mpass){e.details.mpass=''}
            if(e.details.muser!==''&&e.host.indexOf('@')===-1) {
                e.authd=e.details.muser+':'+e.details.mpass+'@';
            }
            if(e.port==80&&e.details.port_force!=='1'){e.porty=''}else{e.porty=':'+e.port}
            e.url=e.protocol+'://'+e.authd+e.host+e.porty;return e.url;
        break;
        case'diskUsedEmit':
            //send the amount used disk space to connected users
            if(s.group[e.ke]&&s.group[e.ke].init){
                misc.tx({f:'diskUsed',size:s.group[e.ke].usedSpace,limit:s.group[e.ke].sizeLimit},'GRP_'+e.ke);
            }
        break;
        case'diskUsedSet':
            //`k` will be used as the value to add or substract
            s.group[e.ke].sizeChangeQueue.push(k)
            if(s.group[e.ke].sizeChanging!==true){
                //lock this function
                s.group[e.ke].sizeChanging=true
                //validate current values
                if(!s.group[e.ke].usedSpace){
                    s.group[e.ke].usedSpace=0
                }else{
                    s.group[e.ke].usedSpace=parseFloat(s.group[e.ke].usedSpace)
                }
                if(s.group[e.ke].usedSpace<0||isNaN(s.group[e.ke].usedSpace)){
                    s.group[e.ke].usedSpace=0
                }
                //set queue processor
                var checkQueue=function(){
                    //get first in queue
                    var currentChange = s.group[e.ke].sizeChangeQueue[0]
                    //change global size value
                    s.group[e.ke].usedSpace=s.group[e.ke].usedSpace+currentChange
                    //remove value just used from queue
                    s.group[e.ke].sizeChangeQueue = s.group[e.ke].sizeChangeQueue.splice(1,s.group[e.ke].sizeChangeQueue.length+10)
                    //do next one
                    if(s.group[e.ke].sizeChangeQueue.length>0){
                        checkQueue()
                    }else{
                        s.group[e.ke].sizeChanging=false
                        s.init('diskUsedEmit',e)
                    }
                }
                checkQueue()
            }
        break;
    }
    if(typeof e.callback==='function'){setTimeout(function(){e.callback()},500);}
}
s.filter=function(x,d){
    switch(x){
        case'archive':
            d.videos.forEach(function(v,n){
                s.video('archive',v)
            })
        break;
        case'email':
            if(d.videos&&d.videos.length>0){
                d.videos.forEach(function(v,n){

                })
                d.mailOptions = {
                    from: '"ShinobiCCTV" <no-reply@shinobi.video>', // sender address
                    to: d.mail, // list of receivers
                    subject: lang['Filter Matches']+' : '+d.name, // Subject line
                    html: lang.FilterMatchesText1+' '+d.videos.length+' '+lang.FilterMatchesText2,
                };
                if(d.execute&&d.execute!==''){
                    d.mailOptions.html+='<div><b>'+lang.Executed+' :</b> '+d.execute+'</div>'
                }
                if(d.delete==='1'){
                    d.mailOptions.html+='<div><b>'+lang.Deleted+' :</b> '+lang.Yes+'</div>'
                }
                d.mailOptions.html+='<div><b>'+lang.Query+' :</b> '+d.query+'</div>'
                d.mailOptions.html+='<div><b>'+lang['Filter ID']+' :</b> '+d.id+'</div>'
                nodemailer.sendMail(d.mailOptions, (error, info) => {
                    if (error) {
                        misc.tx({f:'error',ff:'filter_mail',ke:d.ke,error:error},'GRP_'+d.ke);
                        return ;
                    }
                    misc.tx({f:'filter_mail',ke:d.ke,info:info},'GRP_'+d.ke);
                });
            }
        break;
        case'delete':
            d.videos.forEach(function(v,n){
                s.video('delete',v)
            })
        break;
        case'execute':
            exec(d.execute,{detached: true})
        break;
    }
}
s.video=function(x,e){
    if(!e){e={}};
    switch(x){
        case'getDir':
            if(e.mid&&!e.id){e.id=e.mid};
            if(e.details&&(e.details instanceof Object)===false){
                try{e.details=JSON.parse(e.details)}catch(err){}
            }
            if(e.details&&e.details.dir&&e.details.dir!==''){
                return misc.checkCorrectPathEnding(e.details.dir)+e.ke+'/'+e.id+'/'
            }else{
                return s.dir.videos+e.ke+'/'+e.id+'/';
            }
        break;
    }
    var k={}
    if(x!=='getDir'){e.dir=s.video('getDir',e)}
    switch(x){
        case'fix':
            e.sdir=s.dir.streams+e.ke+'/'+e.id+'/';
            if(!e.filename&&e.time){e.filename=misc.moment(e.time)}
            if(e.filename.indexOf('.')===-1){
                e.filename=e.filename+'.'+e.ext
            }
            misc.tx({f:'video_fix_start',mid:e.mid,ke:e.ke,filename:e.filename},'GRP_'+e.ke)
            s.group[e.ke].mon[e.id].fixingVideos[e.filename]={}
            switch(e.ext){
                case'mp4':
                    e.fixFlags='-vcodec libx264 -acodec aac -strict -2';
                break;
                case'webm':
                    e.fixFlags='-vcodec libvpx -acodec libvorbis';
                break;
            }
            e.spawn=spawn(config.ffmpegDir,('-i '+e.dir+e.filename+' '+e.fixFlags+' '+e.sdir+e.filename).split(' '),{detached: true})
            e.spawn.stdout.on('data',function(data){
                misc.tx({f:'video_fix_data',mid:e.mid,ke:e.ke,filename:e.filename},'GRP_'+e.ke)
            });
            e.spawn.on('close',function(data){
                exec('mv '+e.dir+e.filename+' '+e.sdir+e.filename,{detached: true}).on('exit',function(){
                    misc.tx({f:'video_fix_success',mid:e.mid,ke:e.ke,filename:e.filename},'GRP_'+e.ke)
                    delete(s.group[e.ke].mon[e.id].fixingVideos[e.filename]);
                })
            });
        break;
        case'archive':
            if(!e.filename&&e.time){e.filename=misc.moment(e.time)}
            if(!e.status){e.status=0}
            e.details.archived="1"
            e.save=[JSON.stringify(e.details),e.id,e.ke,misc.nameToTime(e.filename)];
            s.sqlQuery('UPDATE Videos SET details=? WHERE `mid`=? AND `ke`=? AND `time`=?',e.save,function(err,r){
                misc.tx({f:'video_edit',status:3,filename:e.filename+'.'+e.ext,mid:e.mid,ke:e.ke,time:misc.nameToTime(e.filename)},'GRP_'+e.ke);
            });
        break;
        case'delete':
            if(!e.filename&&e.time){e.filename=misc.moment(e.time)}
            var filename
            if(e.filename.indexOf('.')>-1){
                filename = e.filename
            }else{
                filename = e.filename+'.'+e.ext
            }
            if(!e.status){e.status=0}
            e.save=[e.id,e.ke,misc.nameToTime(filename)];
            s.sqlQuery('SELECT * FROM Videos WHERE `mid`=? AND `ke`=? AND `time`=?',e.save,function(err,r){
                if(r&&r[0]){
                    r=r[0]
                    var dir=s.video('getDir',r)
                    s.sqlQuery('DELETE FROM Videos WHERE `mid`=? AND `ke`=? AND `time`=?',e.save,function(){
                        fs.stat(dir+filename,function(err,file){
                            if(err){
                                logging.systemLog('File Delete Error : '+e.ke+' : '+' : '+e.mid,err)
                            }
                            s.init('diskUsedSet',e,-(r.size/1000000))
                        })
                        misc.tx({f:'video_delete',filename:filename,mid:e.mid,ke:e.ke,time:misc.nameToTime(filename),end:misc.moment(new Date,'YYYY-MM-DD HH:mm:ss')},'GRP_'+e.ke);
                        s.file('delete',dir+filename)
                    })
                }
            })
        break;
        case'open':
            //on video open
            e.save=[e.id,e.ke,misc.nameToTime(e.filename),e.ext];
            if(!e.status){e.save.push(0)}else{e.save.push(e.status)}
            k.details={}
            if(e.details&&e.details.dir&&e.details.dir!==''){
                k.details.dir=e.details.dir
            }
            e.save.push(s.s(k.details))
            s.sqlQuery('INSERT INTO Videos (mid,ke,time,ext,status,details) VALUES (?,?,?,?,?,?)',e.save)
            misc.tx({f:'video_build_start',filename:e.filename+'.'+e.ext,mid:e.id,ke:e.ke,time:misc.nameToTime(e.filename),end:misc.moment(new Date,'YYYY-MM-DD HH:mm:ss')},'GRP_'+e.ke);
        break;
        case'close':
            //video function : close
            if(s.group[e.ke]&&s.group[e.ke].mon[e.id]){
                if(s.group[e.ke].mon[e.id].open&&!e.filename){e.filename=s.group[e.ke].mon[e.id].open;e.ext=s.group[e.ke].mon[e.id].open_ext}
                if(s.group[e.ke].mon[e.id].child_node){
                    misc.cx({f:'close',d:s.init('noReference',e)},s.group[e.ke].mon[e.id].child_node_id);
                }else{
                    k.file=e.filename+'.'+e.ext
                    k.dir=e.dir.toString()
                    k.fileExists=fs.existsSync(k.dir+k.file)
                    if(k.fileExists!==true){
                        k.dir=s.dir.videos+'/'+e.ke+'/'+e.id+'/'
                        k.fileExists=fs.existsSync(k.dir+k.file)
                        if(k.fileExists!==true){
                            s.dir.addStorage.forEach(function(v){
                                if(k.fileExists!==true){
                                    k.dir=misc.checkCorrectPathEnding(v.path)+e.ke+'/'+e.id+'/'
                                    k.fileExists=fs.existsSync(k.dir+k.file)
                                }
                            })
                        }
                    }
                    if(k.fileExists===true){
                        k.stat=fs.statSync(k.dir+k.file);
                        e.filesize=k.stat.size;
                        e.filesizeMB=parseFloat((e.filesize/1000000).toFixed(2));
                        e.end_time=misc.moment(k.stat.mtime,'YYYY-MM-DD HH:mm:ss');
                        e.save=[e.filesize,1,e.end_time,e.id,e.ke,misc.nameToTime(e.filename)];
                        if(!e.status){e.save.push(0)}else{e.save.push(e.status)}
                        s.sqlQuery('UPDATE Videos SET `size`=?,`status`=?,`end`=? WHERE `mid`=? AND `ke`=? AND `time`=? AND `status`=?',e.save)
                        misc.txWithSubPermissions({f:'video_build_success',hrefNoAuth:'/videos/'+e.ke+'/'+e.mid+'/'+k.file,filename:k.file,mid:e.id,ke:e.ke,time:moment(misc.nameToTime(e.filename)).format(),size:e.filesize,end:moment(e.end_time).format()},'GRP_'+e.ke,'video_view');

                        //cloud auto savers
                        //webdav
                        if(s.group[e.ke].webdav&&s.group[e.ke].init.use_webdav!=='0'&&s.group[e.ke].init.webdav_save=="1"){
                           fs.readFile(k.dir+k.file,function(err,data){
                               s.group[e.ke].webdav.putFileContents(s.group[e.ke].init.webdav_dir+e.ke+'/'+e.mid+'/'+k.file,"binary",data)
                            .catch(function(err) {
                                   logging.log(e,{type:lang['Webdav Error'],msg:{msg:lang.WebdavErrorText+' <b>/'+e.ke+'/'+e.id+'</b>',info:err},ffmpeg:s.group[e.ke].mon[e.id].ffmpeg})
                                console.error(err);
                               });
                            });
                        }
                        if(s.group[e.ke].init){
                            s.init('diskUsedSet',e,e.filesizeMB)
                            if(config.cron.deleteOverMax===true){
                                //check space
                                s.group[e.ke].sizePurgeQueue.push(1)
                                if(s.group[e.ke].sizePurging!==true){
                                    //lock this function
                                    s.group[e.ke].sizePurging=true
                                    //set queue processor
                                    var finish=function(){
//                                        console.log('checkQueueOne',s.group[e.ke].sizePurgeQueue.length)
                                        //remove value just used from queue
                                        s.group[e.ke].sizePurgeQueue = s.group[e.ke].sizePurgeQueue.splice(1,s.group[e.ke].sizePurgeQueue.length+10)
                                        //do next one
                                        if(s.group[e.ke].sizePurgeQueue.length>0){
                                            checkQueue()
                                        }else{
//                                            console.log('checkQueueFinished',s.group[e.ke].sizePurgeQueue.length)
                                            s.group[e.ke].sizePurging=false
                                            s.init('diskUsedEmit',e)
                                        }
                                    }
                                    var checkQueue=function(){
//                                        console.log('checkQueue',config.cron.deleteOverMaxOffset)
                                        //get first in queue
                                        var currentPurge = s.group[e.ke].sizePurgeQueue[0]
                                        var deleteVideos = function(){
//                                            console.log(s.group[e.ke].usedSpace>(s.group[e.ke].sizeLimit*config.cron.deleteOverMaxOffset))
                                            //run purge command
                                            if(s.group[e.ke].usedSpace>(s.group[e.ke].sizeLimit*config.cron.deleteOverMaxOffset)){
                                                    s.sqlQuery('SELECT * FROM Videos WHERE status != 0 AND details NOT LIKE \'%"archived":"1"%\' AND ke=? ORDER BY `time` ASC LIMIT 2',[e.ke],function(err,evs){
                                                        k.del=[];k.ar=[e.ke];
                                                        evs.forEach(function(ev){
                                                            ev.dir=s.video('getDir',ev)+misc.moment(ev.time)+'.'+ev.ext;
                                                            k.del.push('(mid=? AND time=?)');
                                                            k.ar.push(ev.mid),k.ar.push(ev.time);
                                                            s.file('delete',ev.dir);
                                                            s.init('diskUsedSet',e,-(ev.size/1000000))
                                                            misc.tx({f:'video_delete',ff:'over_max',filename:misc.moment(ev.time)+'.'+ev.ext,mid:ev.mid,ke:ev.ke,time:ev.time,end:misc.moment(new Date,'YYYY-MM-DD HH:mm:ss')},'GRP_'+e.ke);
                                                        });
                                                        if(k.del.length>0){
                                                            k.qu=k.del.join(' OR ');
                                                            s.sqlQuery('DELETE FROM Videos WHERE ke =? AND ('+k.qu+')',k.ar,function(){
                                                                deleteVideos()
                                                            })
                                                        }else{
                                                            finish()
                                                        }
                                                    })
                                            }else{
                                                finish()
                                            }
                                        }
                                        deleteVideos()
                                    }
                                    checkQueue()
                                }
                            }else{
                                s.init('diskUsedEmit',e)
                            }
                        }
                    }else{
                        s.video('delete',e);
                        logging.log(e,{type:lang['File Not Exist'],msg:lang.FileNotExistText,ffmpeg:s.group[e.ke].mon[e.id].ffmpeg})
                        if(e.mode&&config.restart.onVideoNotExist===true&&e.fn){
                            delete(s.group[e.ke].mon[e.id].open);
                            logging.log(e,{type:lang['Camera is not recording'],msg:{msg:lang.CameraNotRecordingText}});
                            if(s.group[e.ke].mon[e.id].started===1){
                                camera.camera('restart',e)
                            }
                        }
                    }
                }
            }
            delete(s.group[e.ke].mon[e.id].open);
        break;
    }
}
s.file=function(x,e){
    if(!e){e={}};
    switch(x){
        case'size':
             return fs.statSync(e.filename)["size"];
        break;
        case'delete':
            if(!e){return false;}
            return exec('rm -f '+e,{detached: true});
        break;
        case'delete_folder':
            if(!e){return false;}
            return exec('rm -rf '+e,{detached: true});
        break;
        case'delete_files':
            if(!e.age_type){e.age_type='min'};if(!e.age){e.age='1'};
            exec('find '+e.path+' -type f -c'+e.age_type+' +'+e.age+' -exec rm -f {} +',{detached: true});
        break;
    }
}

//function for receiving detector data
s.pluginEventController=function(d){
    switch(d.f){
        case'trigger':
            camera.camera('motion',d)
        break;
        case's.tx':
            misc.tx(d.data,d.to)
        break;
        case'sql':
            sql.query(d.query,d.values);
        break;
        case'log':
            logging.systemLog('PLUGIN : '+d.plug+' : ',d)
        break;
    }
}
//multi plugin connections
s.connectedPlugins={}
s.pluginInitiatorSuccess=function(mode,d,cn){
    logging.systemLog('pluginInitiatorSuccess',d)
    if(mode==='client'){
        //is in client mode (camera.js is client)
        cn.pluginEngine=d.plug
        if(!s.connectedPlugins[d.plug]){
            s.connectedPlugins[d.plug]={plug:d.plug}
        }
        logging.systemLog('Connected to plugin : Detector - '+d.plug+' - '+d.type)
        switch(d.type){
            default:case'detector':
                s.ocv={started:moment(),id:cn.id,plug:d.plug,notice:d.notice,isClientPlugin:true};
                cn.ocv=1;
                misc.tx({f:'detector_plugged',plug:d.plug,notice:d.notice},'CPU')
            break;
        }
    }else{
        //is in host mode (camera.js is client)
        switch(d.type){
            default:case'detector':
                s.ocv={started:moment(),id:"host",plug:d.plug,notice:d.notice,isHostPlugin:true};
            break;
        }
    }
    s.connectedPlugins[d.plug].plugged=true
    misc.tx({f:'readPlugins',ke:d.ke},'CPU')
    misc.ocvTx({f:'api_key',key:d.plug})
    s.api[d.plug]={pluginEngine:d.plug,permissions:{},details:{},ip:'0.0.0.0'};
}
s.pluginInitiatorFail=function(mode,d,cn){
    s.connectedPlugins[d.plug].plugged=false
    if(mode==='client'){
        //is in client mode (camera.js is client)
        cn.disconnect()
    }else{
        //is in host mode (camera.js is client)
    }
}
if(config.plugins&&config.plugins.length>0){
    config.plugins.forEach(function(v){
        s.connectedPlugins[v.id]={plug:v.id}
        if(v.enabled===false){return}
        if(v.mode==='host'){
            //is in host mode (camera.js is client)
            if(v.https===true){
                v.https='https://'
            }else{
                v.https='http://'
            }
            if(!v.port){
                v.port=80
            }
            var socket = socketIOclient(v.https+v.host+':'+v.port)
            s.connectedPlugins[v.id].tx = function(x){return socket.emit('f',x)}
            socket.on('connect', function(cn){
                logging.systemLog('Connected to plugin (host) : '+v.id)
                s.connectedPlugins[v.id].tx({f:'init_plugin_as_host',key:v.key})
            });
            socket.on('init',function(d){
                logging.systemLog('Initialize Plugin : Host',d)
                if(d.ok===true){
                    s.pluginInitiatorSuccess("host",d)
                }else{
                    s.pluginInitiatorFail("host",d)
                }
            });
            socket.on('ocv',s.pluginEventController);
            socket.on('disconnect', function(){
                s.connectedPlugins[v.id].plugged=false
                delete(s.api[v.id])
                logging.systemLog('Plugin Disconnected : '+v.id)
                s.connectedPlugins[v.id].reconnector = setInterval(function(){
                    if(socket.connected===true){
                        clearInterval(s.connectedPlugins[v.id].reconnector)
                    }else{
                        socket.connect()
                    }
                },1000*2)
            });
            s.connectedPlugins[v.id].ws = socket;
        }
    })
}
////socket controller
s.cn=function(cn){return{id:cn.id,ke:cn.ke,uid:cn.uid}}
io.on('connection', function(cn){connection.init(cn)});
//Authenticator functions
s.api={};
//auth handler
//params = parameters
//cb = callback
//res = response, only needed for express (http server)
//request = request, only needed for express (http server)
s.auth=function(params,cb,res,req){
    if(req){
        //express (http server) use of auth function
        params.ip=req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        var failed=function(){
            if(!req.ret){req.ret={ok:false}}
            req.ret.msg=lang['Not Authorized'];
            res.end(s.s(req.ret, null, 3));
        }
    }else{
        //socket.io use of auth function
        var failed=function(){
            //maybe log
        }
    }
    var clearAfterTime=function(){
        //remove temp key from memory
        clearTimeout(s.api[params.auth].timeout)
        s.api[params.auth].timeout=setTimeout(function(){
            delete(s.api[params.auth])
        },1000*60*5)
    }
    //check IP address of connecting user
    var finish=function(user){
        if(s.api[params.auth].ip.indexOf('0.0.0.0')>-1||s.api[params.auth].ip.indexOf(params.ip)>-1){
            cb(user);
        }else{
            failed();
        }
    }
    //check if auth key is user's temporary session key
    if(s.group[params.ke]&&s.group[params.ke].users&&s.group[params.ke].users[params.auth]){
        s.group[params.ke].users[params.auth].permissions={};
        cb(s.group[params.ke].users[params.auth]);
    }else{
        //check if key is already in memory to save query time
        if(s.api[params.auth]&&s.api[params.auth].details){
            finish(s.api[params.auth]);
            if(s.api[params.auth].timeout){
               clearAfterTime()
            }
        }else{
            //no key in memory, query db to see if key exists
            //check if using username and password in plain text or md5
            if(params.username&&params.username!==''&&params.password&&params.password!==''){
                s.sqlQuery('SELECT * FROM Users WHERE mail=? AND (pass=? OR pass=?)',[params.username,params.password,misc.md5(params.password)],function(err,r){
                    if(r&&r[0]){
                        r=r[0];
                        r.ip='0.0.0.0';
                        r.auth = misc.gid(20);
                        params.auth = r.auth;
                        r.details=JSON.parse(r.details);
                        r.permissions = {};
                        s.api[r.auth]=r;
                        clearAfterTime();
                        finish(r);
                    }else{
                        failed();
                    }
                })
            }else{
                //not using plain login
                s.sqlQuery('SELECT * FROM API WHERE code=? AND ke=?',[params.auth,params.ke],function(err,r){
                    if(r&&r[0]){
                        r=r[0];
                        s.api[params.auth]={ip:r.ip,uid:r.uid,ke:r.ke,permissions:JSON.parse(r.details),details:{}};
                        s.sqlQuery('SELECT details FROM Users WHERE uid=? AND ke=?',[r.uid,r.ke],function(err,rr){
                            if(rr&&rr[0]){
                                rr=rr[0];
                                try{
                                    s.api[params.auth].mail=rr.mail
                                    s.api[params.auth].details=JSON.parse(rr.details)
                                    s.api[params.auth].lang=s.getLanguageFile(s.api[params.auth].details.lang)
                                }catch(er){}
                            }
                            finish(s.api[params.auth]);
                        })
                    }else{
                        s.sqlQuery('SELECT * FROM Users WHERE auth=? AND ke=?',[params.auth,params.ke],function(err,r){
                            if(r&&r[0]){
                                r=r[0];
                                r.ip='0.0.0.0'
                                s.api[params.auth]=r
                                clearAfterTime()
                                finish(r)
                            }else{
                                failed();
                            }
                        })
                    }
                })
            }
        }
    }
}
//super user authentication handler
s.superAuth=function(x,callback){
    req={};
    req.super=require(location.super);
    req.super.forEach(function(v,n){
        if(x.md5===true){
            x.pass=misc.md5(x.pass);
        }
        if(x.mail.toLowerCase()===v.mail.toLowerCase()&&x.pass===v.pass){
            req.found=1;
            if(x.users===true){
                s.sqlQuery('SELECT * FROM Users WHERE details NOT LIKE ?',['%"sub"%'],function(err,r) {
                    callback({$user:v,users:r,config:config,lang:lang})
                })
            }else{
                callback({$user:v,config:config,lang:lang})
            }
        }
    })
    if(req.found!==1){
        return false;
    }else{
        return true;
    }
}
////Pages
app.enable('trust proxy');
app.use('/libs',express.static(__dirname + '/web/libs'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.set('views', __dirname + '/web/pages');
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
    res.sendFile(__dirname+'/index.html');
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
            exec('chmod +x '+__dirname+'/UPDATE.sh&&'+__dirname+'/UPDATE.sh',{detached: true})
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
//login function
s.deleteFactorAuth=function(r){
    delete(s.factorAuth[r.ke][r.uid])
    if(Object.keys(s.factorAuth[r.ke]).length===0){
        delete(s.factorAuth[r.ke])
    }
}
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
try{
s.cpuUsage=function(e){
    k={}
    switch(s.platform){
        case'win32':
            k.cmd="@for /f \"skip=1\" %p in ('wmic cpu get loadpercentage') do @echo %p%"
        break;
        case'darwin':
            k.cmd="ps -A -o %cpu | awk '{s+=$1} END {print s}'";
        break;
        case'linux':
            k.cmd='LANG=C top -b -n 2 | grep "^'+config.cpuUsageMarker+'" | awk \'{print $2}\' | tail -n1';
        break;
    }
    if(config.customCpuCommand){
      exec(config.customCpuCommand,{encoding:'utf8',detached: true},function(err,d){
          if(s.isWin===true) {
              d = d.replace(/(\r\n|\n|\r)/gm, "").replace(/%/g, "")
          }
          e(d)
      });
    } else if(k.cmd){
         exec(k.cmd,{encoding:'utf8',detached: true},function(err,d){
             if(s.isWin===true){
                 d=d.replace(/(\r\n|\n|\r)/gm,"").replace(/%/g,"")
             }
             e(d)
         });
    } else{
        e(0)
    }
}
s.ramUsage=function(e){
    k={}
    switch(s.platform){
        case'win32':
            k.cmd = "wmic OS get FreePhysicalMemory /Value"
        break;
        case'darwin':
            k.cmd = "vm_stat | awk '/^Pages free: /{f=substr($3,1,length($3)-1)} /^Pages active: /{a=substr($3,1,length($3-1))} /^Pages inactive: /{i=substr($3,1,length($3-1))} /^Pages speculative: /{s=substr($3,1,length($3-1))} /^Pages wired down: /{w=substr($4,1,length($4-1))} /^Pages occupied by compressor: /{c=substr($5,1,length($5-1)); print ((a+w)/(f+a+i+w+s+c))*100;}'"
        break;
        default:
            k.cmd = "LANG=C free | grep Mem | awk '{print $4/$2 * 100.0}'";
        break;
    }
    if(k.cmd){
         exec(k.cmd,{encoding:'utf8',detached: true},function(err,d){
             if(s.isWin===true){
                 d=(parseInt(d.split('=')[1])/(s.totalmem/1000))*100
             }
             e(d)
         });
    }else{
        e(0)
    }
}
    setInterval(function(){
        s.cpuUsage(function(cpu){
            s.ramUsage(function(ram){
                misc.tx({f:'os',cpu:cpu,ram:ram},'CPU');
            })
        })
    },10000);
}catch(err){logging.systemLog(lang['CPU indicator will not work. Continuing...'])}
//check disk space every 20 minutes
if(config.autoDropCache===true){
    setInterval(function(){
        exec('echo 3 > /proc/sys/vm/drop_caches',{detached: true})
    },60000*20);
}
s.beat=function(){
    setTimeout(s.beat, 8000);
    io.sockets.emit('ping',{beat:1});
}
s.beat();
s.processReady = function(){
    logging.systemLog(lang.startUpText5)
    process.send('ready')
}
setTimeout(function(){
    //get current disk used for each isolated account (admin user) on startup
    s.sqlQuery('SELECT * FROM Users WHERE details NOT LIKE ?',['%"sub"%'],function(err,r){
        if(r&&r[0]){
            var count = r.length
            var countFinished = 0
            r.forEach(function(v,n){
                v.size=0;
                v.limit=JSON.parse(v.details).size
                s.sqlQuery('SELECT * FROM Videos WHERE ke=? AND status!=?',[v.ke,0],function(err,rr){
                    ++countFinished
                    if(r&&r[0]){
                        rr.forEach(function(b){
                            v.size+=b.size
                        })
                    }
                    logging.systemLog(v.mail+' : '+lang.startUpText0+' : '+rr.length,v.size)
                    s.init('group',v)
                    logging.systemLog(v.mail+' : '+lang.startUpText1,countFinished+'/'+count)
                    if(countFinished===count){
                        logging.systemLog(lang.startUpText2)
                        ////close open videos
                        s.sqlQuery('SELECT * FROM Videos WHERE status=?',[0],function(err,r){
                            if(r&&r[0]){
                                r.forEach(function(v){
                                    s.init(0,v)
                                    v.filename=misc.moment(v.time);
                                    s.video('close',v);
                                })
                            }
                            logging.systemLog(lang.startUpText3)
                            setTimeout(function(){
                                logging.systemLog(lang.startUpText4)
                                //preliminary monitor start
                                s.sqlQuery('SELECT * FROM Monitors', function(err,r) {
                                    if(err){logging.systemLog(err)}
                                    if(r&&r[0]){
                                        r.forEach(function(v){
                                            s.init(0,v);
                                            r.ar={};
                                            r.ar.id=v.mid;
                                            Object.keys(v).forEach(function(b){
                                                r.ar[b]=v[b];
                                            })
                                            if(!s.group[v.ke]){
                                                s.group[v.ke]={}
                                                s.group[v.ke].mon_conf={}
                                            }
                                            v.details=JSON.parse(v.details);
                                            s.group[v.ke].mon_conf[v.mid]=v;
                                            camera.camera(v.mode,r.ar);
                                        });
                                    }
                                    s.processReady()
                                });
                            },3000)
                        })
                    }
                })
            })
        }else{
            s.processReady()
        }
    })
},1500)
