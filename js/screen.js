var fs = require('fs');

module.exports = function(s,config,misc,logging){
    let module = {};

    if(config.productType==='Pro'){
        var LdapAuth = require('ldapauth-fork');
    }
    module.init = function(req,res){
        req.ip=req.headers['cf-connecting-ip']||req.headers["CF-Connecting-IP"]||req.headers["'x-forwarded-for"]||req.connection.remoteAddress;
        if(req.query.json=='true'){
            res.header("Access-Control-Allow-Origin",req.headers.origin);
        }
        req.renderFunction=function(focus,data){
            if(req.query.json=='true'){
                delete(data.config)
                data.ok=true;
                res.setHeader('Content-Type', 'application/json');
                res.end(s.s(data, null, 3))
            }else{
                data.screen=req.params.screen
                res.render(focus,data,function(err,html){
                    if(err){
                        logging.systemLog(err)
                    }
                    res.end(html)
                });
            }
        }
        req.failed=function(board){
            if(req.query.json=='true'){
                res.setHeader('Content-Type', 'application/json');
                res.end(s.s({ok:false}, null, 3))
            }else{
                res.render('index',{failedLogin:true,lang:lang,config:config,screen:req.params.screen},function(err,html){
                    if(err){
                        logging.systemLog(err)
                    }
                    res.end(html);
                });
            }
            req.logTo={ke:'$',mid:'$USER'}
            req.logData={type:lang['Authentication Failed'],msg:{for:board,mail:req.body.mail,ip:req.ip}}
            if(board==='super'){
                logging.log(req.logTo,req.logData)
            }else{
                s.sqlQuery('SELECT ke,uid,details FROM Users WHERE mail=?',[req.body.mail],function(err,r) {
                    if(r&&r[0]){
                        r=r[0]
                        r.details=JSON.parse(r.details);
                        r.lang=s.getLanguageFile(r.details.lang)
                        req.logData.id=r.uid
                        req.logData.type=r.lang['Authentication Failed']
                        req.logTo.ke=r.ke
                    }
                    logging.log(req.logTo,req.logData)
                })
            }
        }
        req.fn=function(r){
            switch(req.body.function){
                case'cam':
                    s.sqlQuery('SELECT * FROM Monitors WHERE ke=? AND type=?',[r.ke,"dashcam"],function(err,rr){
                        req.resp.mons=rr;
                        req.renderFunction("dashcam",{$user:req.resp,lang:r.lang,define:s.getDefinitonFile(r.details.lang)});
                    })
                break;
                case'streamer':
                    s.sqlQuery('SELECT * FROM Monitors WHERE ke=? AND type=?',[r.ke,"socket"],function(err,rr){
                        req.resp.mons=rr;
                        req.renderFunction("streamer",{$user:req.resp,lang:r.lang,define:s.getDefinitonFile(r.details.lang)});
                    })
                break;
                case'admin':
                    if(!r.details.sub){
                        s.sqlQuery('SELECT uid,mail,details FROM Users WHERE ke=? AND details LIKE \'%"sub"%\'',[r.ke],function(err,rr) {
                            s.sqlQuery('SELECT * FROM Monitors WHERE ke=?',[r.ke],function(err,rrr) {
                                req.renderFunction("admin",{$user:req.resp,$subs:rr,$mons:rrr,lang:r.lang,define:s.getDefinitonFile(r.details.lang)});
                            })
                        })
                    }else{
                        //not admin user
                        req.renderFunction("home",{$user:req.resp,config:config,lang:r.lang,define:s.getDefinitonFile(r.details.lang),addStorage:s.dir.addStorage,fs:fs,__dirname:s.__basedir});
                    }
                break;
                default:
                    req.renderFunction("home",{$user:req.resp,config:config,lang:r.lang,define:s.getDefinitonFile(r.details.lang),addStorage:s.dir.addStorage,fs:fs,__dirname:s.__basedir});
                break;
            }
            logging.log({ke:r.ke,mid:'$USER'},{type:r.lang['New Authentication Token'],msg:{for:req.body.function,mail:r.mail,id:r.uid,ip:req.ip}})
        //    res.end();
        }
        if(req.body.mail&&req.body.pass){
            req.default=function(){
                s.sqlQuery('SELECT * FROM Users WHERE mail=? AND pass=?',[req.body.mail,misc.md5(req.body.pass)],function(err,r) {
                    req.resp={ok:false};
                    if(!err&&r&&r[0]){
                        r=r[0];r.auth=misc.md5(misc.gid());
                        s.sqlQuery("UPDATE Users SET auth=? WHERE ke=? AND uid=?",[r.auth,r.ke,r.uid])
                        req.resp={ok:true,auth_token:r.auth,ke:r.ke,uid:r.uid,mail:r.mail,details:r.details};
                        r.details=JSON.parse(r.details);
                        r.lang=s.getLanguageFile(r.details.lang)
                        req.factorAuth=function(cb){
                            if(r.details.factorAuth==="1"){
                                if(!r.details.acceptedMachines||!(r.details.acceptedMachines instanceof Object)){
                                    r.details.acceptedMachines={}
                                }
                                if(!r.details.acceptedMachines[req.body.machineID]){
                                    req.complete=function(){
                                        s.factorAuth[r.ke][r.uid].info=req.resp;
                                        clearTimeout(s.factorAuth[r.ke][r.uid].expireAuth)
                                        s.factorAuth[r.ke][r.uid].expireAuth=setTimeout(function(){
                                            s.deleteFactorAuth(r)
                                        },1000*60*15)
                                        req.renderFunction("factor",{$user:req.resp,lang:r.lang})
                                    }
                                    if(!s.factorAuth[r.ke]){s.factorAuth[r.ke]={}}
                                    if(!s.factorAuth[r.ke][r.uid]){
                                        s.factorAuth[r.ke][r.uid]={key:misc.nid(),user:r}
                                        r.mailOptions = {
                                            from: '"ShinobiCCTV" <no-reply@shinobi.video>',
                                            to: r.mail,
                                            subject: r.lang['2-Factor Authentication'],
                                            html: r.lang['Enter this code to proceed']+' <b>'+s.factorAuth[r.ke][r.uid].key+'</b>. '+r.lang.FactorAuthText1,
                                        };
                                        nodemailer.sendMail(r.mailOptions, (error, info) => {
                                            if (error) {
                                                logging.systemLog(r.lang.MailError,error)
                                                req.fn(r)
                                                return
                                            }
                                            req.complete()
                                        });
                                    }else{
                                        req.complete()
                                    }
                                }else{
                                   req.fn(r)
                                }
                            }else{
                               req.fn(r)
                            }
                        }
                        if(r.details.sub){
                            s.sqlQuery('SELECT details FROM Users WHERE ke=? AND details NOT LIKE ?',[r.ke,'%"sub"%'],function(err,rr) {
                                rr=rr[0];
                                rr.details=JSON.parse(rr.details);
                                r.details.mon_groups=rr.details.mon_groups;
                                req.resp.details=JSON.stringify(r.details);
                                req.factorAuth()
                            })
                        }else{
                            req.factorAuth()
                        }
                    }else{
                        req.failed(req.body.function)
                    }
                })
            }
            if(LdapAuth&&req.body.function==='ldap'&&req.body.key!==''){
                s.sqlQuery('SELECT * FROM Users WHERE  ke=? AND details NOT LIKE ?',[req.body.key,'%"sub"%'],function(err,r) {
                    if(r&&r[0]){
                        r=r[0]
                        r.details=JSON.parse(r.details)
                        r.lang=s.getLanguageFile(r.details.lang)
                        if(r.details.use_ldap!=='0'&&r.details.ldap_enable==='1'&&r.details.ldap_url&&r.details.ldap_url!==''){
                            req.mailArray={}
                            req.body.mail.split(',').forEach(function(v){
                                v=v.split('=')
                                req.mailArray[v[0]]=v[1]
                            })
                            if(!r.details.ldap_bindDN||r.details.ldap_bindDN===''){
                                r.details.ldap_bindDN=req.body.mail
                            }
                            if(!r.details.ldap_bindCredentials||r.details.ldap_bindCredentials===''){
                                r.details.ldap_bindCredentials=req.body.pass
                            }
                            if(!r.details.ldap_searchFilter||r.details.ldap_searchFilter===''){
                                r.details.ldap_searchFilter=req.body.mail
                                if(req.mailArray.cn){
                                    r.details.ldap_searchFilter='cn='+req.mailArray.cn
                                }
                                if(req.mailArray.uid){
                                    r.details.ldap_searchFilter='uid='+req.mailArray.uid
                                }
                            }else{
                                r.details.ldap_searchFilter=r.details.ldap_searchFilter.replace('{{username}}',req.body.mail)
                            }
                            if(!r.details.ldap_searchBase||r.details.ldap_searchBase===''){
                                r.details.ldap_searchBase='dc=test,dc=com'
                            }
                            req.auth = new LdapAuth({
                                url:r.details.ldap_url,
                                bindDN:r.details.ldap_bindDN,
                                bindCredentials:r.details.ldap_bindCredentials,
                                searchBase:r.details.ldap_searchBase,
                                searchFilter:'('+r.details.ldap_searchFilter+')',
                                reconnect:true
                            });
                            req.auth.on('error', function (err) {
                                console.error('LdapAuth: ', err);
                            });
    
                            req.auth.authenticate(req.body.mail, req.body.pass, function(err, user) {
                                if(user){
                                    //found user
                                    if(!user.uid){
                                        user.uid=misc.gid()
                                    }
                                    req.resp={
                                        ke:req.body.key,
                                        uid:user.uid,
                                        auth:misc.md5(misc.gid()),
                                        mail:user.mail,
                                        pass:misc.md5(req.body.pass),
                                        details:JSON.stringify({
                                            sub:'1',
                                            ldap:'1',
                                            allmonitors:'1',
                        filter: {}
                                        })
                                    }
                                    user.post=[]
                                    Object.keys(req.resp).forEach(function(v){
                                        user.post.push(req.resp[v])
                                    })
                                    logging.log({ke:req.body.key,mid:'$USER'},{type:r.lang['LDAP Success'],msg:{user:user}})
                                    s.sqlQuery('SELECT * FROM Users WHERE  ke=? AND mail=?',[req.body.key,user.cn],function(err,rr){
                                        if(rr&&rr[0]){
                                            //already registered
                                            rr=rr[0]
                                            req.resp=rr;
                                            rr.details=JSON.parse(rr.details)
                                            req.resp.lang=s.getLanguageFile(rr.details.lang)
                                            logging.log({ke:req.body.key,mid:'$USER'},{type:r.lang['LDAP User Authenticated'],msg:{user:user,shinobiUID:rr.uid}})
                                            s.sqlQuery("UPDATE Users SET auth=? WHERE ke=? AND uid=?",[req.resp.auth,req.resp.ke,rr.uid])
                                        }else{
                                            //new ldap login
                                            logging.log({ke:req.body.key,mid:'$USER'},{type:r.lang['LDAP User is New'],msg:{info:r.lang['Creating New Account'],user:user}})
                                            req.resp.lang=r.lang
                                            s.sqlQuery('INSERT INTO Users (ke,uid,auth,mail,pass,details) VALUES (?,?,?,?,?,?)',user.post)
                                        }
                                        req.resp.details=JSON.stringify(req.resp.details)
                                        req.resp.auth_token=req.resp.auth
                                        req.resp.ok=true
                                        req.fn(req.resp)
                                    })
                                    return
                                }
                                logging.log({ke:req.body.key,mid:'$USER'},{type:r.lang['LDAP Failed'],msg:{err:err}})
                                //no user
                                req.default()
                            });
    
                            req.auth.close(function(err) {
    
                            })
                        }else{
                            req.default()
                        }
                    }else{
                        req.default()
                    }
                })
            }else{
                if(req.body.function==='super'){
                    if(!fs.existsSync(location.super)){
                        res.end(lang.superAdminText)
                        return
                    }
                    req.ok=s.superAuth({mail:req.body.mail,pass:req.body.pass,users:true,md5:true},function(data){
                        s.sqlQuery('SELECT * FROM Logs WHERE ke=? ORDER BY `time` DESC LIMIT 30',['$'],function(err,r) {
                            if(!r){
                                r=[]
                            }
                            data.Logs=r;
                            fs.readFile(location.config,'utf8',function(err,file){
                                data.plainConfig=JSON.parse(file)
                                req.renderFunction("super",data);
                            })
                        })
                    })
                    if(req.ok===false){
                        req.failed(req.body.function)
                    }
                }else{
                    req.default()
                }
            }
        }else{
            if(req.body.machineID&&req.body.factorAuthKey){
                if(s.factorAuth[req.body.ke]&&s.factorAuth[req.body.ke][req.body.id]&&s.factorAuth[req.body.ke][req.body.id].key===req.body.factorAuthKey){
                    if(s.factorAuth[req.body.ke][req.body.id].key===req.body.factorAuthKey){
                        if(req.body.remember==="1"){
                            req.details=JSON.parse(s.factorAuth[req.body.ke][req.body.id].info.details)
                            req.lang=s.getLanguageFile(req.details.lang)
                            if(!req.details.acceptedMachines||!(req.details.acceptedMachines instanceof Object)){
                                req.details.acceptedMachines={}
                            }
                            if(!req.details.acceptedMachines[req.body.machineID]){
                                req.details.acceptedMachines[req.body.machineID]={}
                                s.sqlQuery("UPDATE Users SET details=? WHERE ke=? AND uid=?",[s.s(req.details),req.body.ke,req.body.id])
                            }
                        }
                        req.resp=s.factorAuth[req.body.ke][req.body.id].info
                        req.fn(s.factorAuth[req.body.ke][req.body.id].user)
                    }else{
                        req.renderFunction("factor",{$user:s.factorAuth[req.body.ke][req.body.id].info,lang:req.lang});
                        res.end();
                    }
                }else{
                    req.failed(lang['2-Factor Authentication'])
                }
            }else{
                req.failed(lang['2-Factor Authentication'])
            }
        }
    }


    return module;
}