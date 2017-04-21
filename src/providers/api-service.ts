import { Injectable } from '@angular/core';
import { Http } from '@angular/http';
import { Transfer} from '@ionic-native/transfer';
import { File } from '@ionic-native/file';
import { NativeGeocoder, NativeGeocoderForwardResult } from '@ionic-native/native-geocoder';
import { NativeStorage } from '@ionic-native/native-storage';

import { Login } from '../models/login';
import { Deployment } from '../models/deployment';
import { User } from '../models/user';
import { Form } from '../models/form';
import { Stage } from '../models/stage';
import { Attribute } from '../models/attribute';
import { Post } from '../models/post';
import { Value } from '../models/value';
import { Image } from '../models/image';
import { Collection } from '../models/collection';
import { Filter } from '../models/filter';

import { HttpService } from '../providers/http-service';
import { LoggerService } from '../providers/logger-service';
import { DatabaseService } from '../providers/database-service';
import { VimeoService } from '../providers/vimeo-service';

import { USHAHIDI_CLIENT_ID, USHAHIDI_CLIENT_SECRET } from '../constants/secrets';

@Injectable()
export class ApiService extends HttpService {

  private source: string = "mobile";
  private clientId: string = USHAHIDI_CLIENT_ID;
  private clientSecret: string = USHAHIDI_CLIENT_SECRET;
  private scope: string = "api posts forms tags sets users media config";
  // api posts media forms tags savedsearches sets users stats layers
  // config messages notifications contacts roles permissions csv

  constructor(
    public http: Http,
    public file:File,
    public transfer:Transfer,
    public vimeo:VimeoService,
    public logger:LoggerService,
    private storage: NativeStorage,
    public database:DatabaseService,
    public nativeGeocoder:NativeGeocoder) {
    super(http, file, transfer, logger);
  }

  searchDeployments(search:string):Promise<Deployment[]> {
    return new Promise((resolve, reject) => {
      let params = {
        q: search
      };
      let url = "https://api.ushahidi.io/deployments";
      this.httpGet(url, null, params).then(
        (results:any[]) => {
          let deployments = [];
          for (let item of results) {
            if (item.status == 'deployed') {
              let deployment:Deployment = new Deployment();
              deployment.tier = item.tier;
              deployment.status = item.status;
              deployment.name = item.deployment_name;
              deployment.domain = `${item.subdomain}.ushahidi.io`;
              deployment.website = `https://${item.subdomain}.ushahidi.io`;
              deployment.api = `https://${item.subdomain}.${item.domain}`;
              deployments.push(deployment);
            }
          }
          resolve(deployments);
        },
        (error:any) => {
          reject(error);
        });
    });
  }

  clientLogin(deployment:Deployment):Promise<Login> {
    return new Promise((resolve, reject) => {
      let url = deployment.api + "/oauth/token";
      let params = {
        grant_type: "client_credentials",
        scope: this.scope,
        client_id: this.clientId,
        client_secret: this.clientSecret};
      this.httpPost(url, null, params).then(
        (data:any) => {
          let login:Login = <Login> {
            access_token: data.access_token };
          this.storage.setItem(deployment.website, JSON.stringify(login)).then(
              (data:any) => {
                resolve(login);
              },
              (error:any) => {
                reject(error);
              });
        },
        (error:any) => {
          reject(error);
        })
    });
  }

  userLogin(deployment:Deployment, username:string, password:string):Promise<Login> {
    return new Promise((resolve, reject) => {
      let url = deployment.api + "/oauth/token";
      let params = {
        grant_type: "password",
        scope: this.scope,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        username: username,
        password: password };
      this.httpPost(url, null, params).then(
        (data:any) => {
          let login:Login = <Login> {
            username: username,
            password: password,
            access_token: data.access_token,
            refresh_token: data.refresh_token }
          this.storage.setItem(deployment.website, JSON.stringify(login)).then(
            (data:any) => {
              this.getUser(deployment, "me").then((user:User) => {
                login.user_id = user.id;
                login.user_role = user.role;
                this.storage.setItem(deployment.website, JSON.stringify(login)).then(
                  (data:any) => {
                    resolve(login);
                  },
                  (error:any) => {
                    reject(error);
                  });
              });
            },
            (error:any) => {
              reject(error);
            });
        },
        (error:any) => {
          reject(error);
        })
    });
  }

  userOrClientLogin(deployment:Deployment):Promise<Login> {
    return new Promise((resolve, reject) => {
      this.getLogin(deployment).then(
        (login:Login) => {
            if (login.username && login.password) {
              this.userLogin(deployment, login.username, login.password).then(
                (_login:Login) => {
                  resolve(_login);
                },
                (error:any) => {
                  reject(error);
                });
            }
            else {
              this.clientLogin(deployment).then(
                (_login:Login) => {
                  resolve(_login);
                },
                (error:any) => {
                  reject(error);
                });
            }
         },
        (error:any) => {
          this.clientLogin(deployment).then(
            (_login:Login) => {
              resolve(_login);
            },
            (error:any) => {
              reject(error);
            });
        });
    });
  }

  authRefresh(deployment:Deployment, refreshToken:string):Promise<Login> {
    return new Promise((resolve, reject) => {
      let url = deployment.api + "/oauth/token";
      let params = {
        grant_type: "refresh_token",
        scope: this.scope,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken };
      this.httpPost(url, null, params).then(
        (data:any) => {
          let login:Login = <Login> {
            access_token: data.access_token,
            refresh_token: data.refresh_token }
          this.storage.setItem(deployment.website, JSON.stringify(login)).then(
            (data:any) => {
              resolve(login);
            },
            (error:any) => {
              reject(error);
            });
        },
        (error:any) => {
          reject(error);
        })
    });
  }

  getLogin(deployment:Deployment):Promise<Login> {
    return new Promise((resolve, reject) => {
       this.storage.getItem(deployment.website).then(
          (data:any) => {
            this.logger.info(this, "getLogin", deployment.api, data);
            if (data && data.length > 0) {
              resolve(JSON.parse(data));
            }
            else {
              reject("No Login");
            }
          },
          (error:any) => {
            this.logger.error(this, "getLogin", deployment.api, error);
            reject(error);
          });
    });
  }

  apiGet(deployment:Deployment, endpoint:string, params:any=null):Promise<any> {
    return new Promise((resolve, reject) => {
      this.getLogin(deployment).then((login:Login) => {
        let url = deployment.api + endpoint;
        this.httpGet(url, login.access_token, params).then(
          (data:any) => {
            resolve(data);
          },
          (error:any) => {
            reject(error);
          });
      });
    });
  }

  apiPost(deployment:Deployment, endpoint:string, params:any=null):Promise<any> {
    return new Promise((resolve, reject) => {
      this.getLogin(deployment).then((login:Login) => {
        let url = deployment.api + endpoint;
        this.httpPost(url, login.access_token, params).then(
          (data:any) => {
            resolve(data);
          },
          (error:any) => {
            reject(error);
          });
      });
    });
  }

  apiPut(deployment:Deployment, endpoint:string, params:any=null):Promise<any> {
    return new Promise((resolve, reject) => {
      this.getLogin(deployment).then((login:Login) => {
        let url = deployment.api + endpoint;
        this.httpPut(url, login.access_token, params).then(
          (data:any) => {
            resolve(data);
          },
          (error:any) => {
            reject(error);
          });
      });
    });
  }

  apiDelete(deployment:Deployment, endpoint:string):Promise<any> {
    return new Promise((resolve, reject) => {
      this.getLogin(deployment).then((login:Login) => {
        let url = deployment.api + endpoint;
        this.httpDelete(url, login.access_token).then(
          (data:any) => {
            resolve(data);
          },
          (error:any) => {
            reject(error);
          });
      });
    });
  }

  apiUpload(deployment:Deployment, endpoint:string, file:string, mimeType:string):Promise<any> {
    return new Promise((resolve, reject) => {
      this.getLogin(deployment).then((login:Login) => {
        let url = deployment.api + endpoint;
        this.fileUpload(url, login.access_token, file, "POST", mimeType).then(
          (data:any) => {
            resolve(data);
          },
          (error:any) => {
            reject(error);
          });
      });
    });
  }

  getUsers(deployment:Deployment, cache:boolean=false, offline:boolean=false):Promise<User[]> {
    return new Promise((resolve, reject) => {
      if (cache || offline) {
        this.database.getUsers(deployment).then(
          (users:User[]) => {
            if (users && users.length > 0) {
              resolve(users);
            }
            else if (offline) {
              resolve([]);
            }
            else {
              this.getUsers(deployment, false).then(
                (users:User[]) => {
                  resolve(users);
                },
                (error:any) => {
                  reject(error);
                });
            }
          },
          (error:any) => {
            reject(error);
          });
      }
      else {
        this.apiGet(deployment, "/api/v3/users/").then(
          (data:any) => {
            let saves = [];
            let users = [];
            deployment.users_count = data.total_count;
            saves.push(this.database.saveDeployment(deployment));
            for (let item of data.results) {
              let user:User = new User();
              user.id = item.id;
              user.role = item.role;
              user.email = item.email;
              user.name = item.realname;
              if (item.gravatar) {
                user.gravatar = item.gravatar;
                user.image = `https://www.gravatar.com/avatar/${item.gravatar}.jpg?s=32`;
              }
              users.push(user);
              saves.push(this.database.saveUser(deployment, user));
            }
            Promise.all(saves).then(
              (saved) => {
                resolve(users);
              },
              (error:any) => {
                reject(error);
              });
          },
          (error:any) => {
            reject(error);
          });
      }
    });
  }

  getUser(deployment:Deployment, user:any="me", cache:boolean=false, offline:boolean=false):Promise<User>  {
    return new Promise((resolve, reject) => {
      this.apiGet(deployment, `/api/v3/users/${user}`).then(
        (data:any) => {
          let user:User = new User();
          user.id = data.id;
          user.role = data.role;
          user.email = data.email;
          user.name = data.realname;
          if (data.gravatar) {
            user.gravatar = data.gravatar;
            user.image = `https://www.gravatar.com/avatar/${data.gravatar}.jpg?s=32`;
          }
          resolve(user);
        },
        (error:any) => {
          reject(error);
        });
    });
  }

  getDeployment(deployment:Deployment, cache:boolean=false, offline:boolean=false):Promise<Deployment> {
    return new Promise((resolve, reject) => {
      if (cache || offline) {
        this.database.getDeployment(deployment.id).then(
          (deployment:Deployment) => {
            if (deployment.image && deployment.description) {
              resolve(deployment);
            }
            else if (offline) {
              resolve(deployment);
            }
            else {
              this.getDeployment(deployment, false, offline).then(
                (deployment:Deployment) => {
                  resolve(deployment);
                },
                (error:any) => {
                  reject(error);
                });
            }
          },
          (error:any) => {
            reject(error);
          });
      }
      else {
        this.apiGet(deployment, "/api/v3/config").then(
          (data:any) => {
            let deployment:Deployment = new Deployment();
            this.logger.info(this, "getDeployment", deployment);
            for (let result of data.results) {
              if (result.id == 'map') {
                if (result.default_view) {
                  deployment.map_zoom = result.default_view.zoom;
                  deployment.map_style = result.default_view.baselayer;
                  deployment.map_latitude = result.default_view.lat;
                  deployment.map_longitude = result.default_view.lon;
                }
              }
              else if (result.id == 'site') {
                deployment.name = result.name;
                deployment.email = result.email;
                deployment.description = result.description;
                if (result.image_header) {
                  deployment.image = encodeURI(result.image_header);
                }
                if (result.allowed_privileges) {
                  deployment.can_read = result.allowed_privileges.indexOf("read") > -1;
                  deployment.can_create = result.allowed_privileges.indexOf("create") > -1;
                  deployment.can_update = result.allowed_privileges.indexOf("update") > -1;
                  deployment.can_delete = result.allowed_privileges.indexOf("delete") > -1;
                }
                else {
                  deployment.can_read = false;
                  deployment.can_create = false;
                  deployment.can_update = false;
                  deployment.can_delete = false;
                }
              }
            }
            resolve(deployment);
          },
          (error:any) => {
            reject(error);
          });
      }
    });
  }

  updateDeployment(deployment:Deployment, changes:{}=null):Promise<any> {
    return new Promise((resolve, reject) => {
      if (changes == null) {
        changes = {
          name: deployment.name,
          email: deployment.email,
          description: deployment.description };
      }
      this.apiPut(deployment, "/api/v3/config/site", changes).then(
        (data:any) => {
          resolve(data);
        },
        (error:any) => {
          reject(error);
        })
    });
  }

  getPosts(deployment:Deployment, filter:Filter=null, cache:boolean=false, offline:boolean=false, limit:number=10, offset:number=0):Promise<Post[]> {
    return new Promise((resolve, reject) => {
      if (cache || offline) {
        this.database.getPosts(deployment, filter, limit, offset).then(
          (posts:Post[]) => {
            if (posts && posts.length >= limit) {
              resolve(posts);
            }
            else if (offline) {
              resolve([]);
            }
            else {
              this.getPosts(deployment, filter, false, offline, limit, offset).then(
                (posts:Post[]) => {
                  resolve(posts);
                },
                (error:any) => {
                  reject(error);
              });
            }
          },
          (error:any) => {
            reject(error);
          });
      }
      else {
        let params = { limit: limit, offset: offset };
        let statuses = [];
        if (filter == null || filter.show_published) {
          statuses.push("published");
        }
        if (filter == null || filter.show_archived) {
          statuses.push("archived");
        }
        if (filter == null || filter.show_inreview) {
          statuses.push("draft");
        }
        if (statuses.length > 0) {
          params['status'] = statuses.join(",");
        }
        if (filter && filter.show_forms && filter.show_forms.length > 0) {
          params["form"] = filter.show_forms;
        }
        if (filter && filter.search_text && filter.search_text.length > 0) {
          params["q"] = filter.search_text;
        }
        this.apiGet(deployment, "/api/v3/posts", params).then(
          (data:any) => {
            let saves = [];
            deployment.posts_count = data.total_count;
            saves.push(this.database.saveDeployment(deployment));
            for (let item of data.results) {
              let post:Post = new Post();
              post.deployment_id = deployment.id;
              post.id = item.id;
              post.url = `${deployment.website}/posts/${item.id}`;
              post.slug = item.slug;
              post.title = item.title;
              post.description = item.content;
              post.color = item.color;
              post.status = item.status;
              post.created = item.created;
              post.updated = item.updated;
              post.posted = item.post_date;
              if (item.user) {
                post.user_id = item.user.id;
              }
              if (item.form) {
                post.form_id = item.form.id;
              }
              if (item.allowed_privileges) {
                post.can_read = item.allowed_privileges.indexOf("read") > -1;
                post.can_create = item.allowed_privileges.indexOf("create") > -1;
                post.can_update = item.allowed_privileges.indexOf("update") > -1;
                post.can_delete = item.allowed_privileges.indexOf("delete") > -1;
              }
              else {
                post.can_read = false;
                post.can_create = false;
                post.can_update = false;
                post.can_delete = false;
              }
              post.values = [];
              for (let key in item.values) {
                let text:any = item.values[key][0];
                let value:Value = new Value();
                value.deployment_id = deployment.id;
                value.post_id = post.id;
                value.key = key;
                value.value = text;
                if (text && text.lat && text.lon) {
                  post.latitude = text.lat;
                  post.longitude = text.lon;
                  value.value = `${text.lat},${text.lon}`;
                }
                else {
                  value.value = text;
                }
                post.values.push(value);
                saves.push(this.database.saveValue(deployment, value));
              }
              saves.push(this.database.savePost(deployment, post));
            }
            Promise.all(saves).then(saved => {
              this.database.getPosts(deployment, filter, limit, offset).then(
                (posts:Post[]) => {
                  resolve(posts);
                },
                (error:any) => {
                  reject(error);
              });
            });
          },
          (error:any) => {
            reject(error);
          });
      }
    });
  }

  createPost(deployment:Deployment, post:Post):Promise<any> {
    return new Promise((resolve, reject) => {
      let values = {}
      for (let value of post.values) {
        if (value.value == null || value.value.length == 0) {
          values[value.key] = [];
        }
        else if (value.input == 'number' || value.input == 'upload' || value.input == 'video') {
          values[value.key] = [Number(value.value)];
        }
        else if (value.input == 'location') {
          if (value.value.indexOf(",") > -1) {
            let location = value.value.split(",");
            values[value.key] = [{
              lat: Number(location[0]),
              lon: Number(location[1])}];
          }
          else {
            values[value.key] = [value.value];
          }
        }
        else {
          values[value.key] = [value.value];
        }
      }
      let params = {
        source: this.source,
        form: { id: post.form_id },
        title: post.title,
        content: post.description,
        values: values };
      if (post.user_id && post.user_id > 0) {
        params['user'] = { id: post.user_id };
      }
      this.apiPost(deployment, "/api/v3/posts", params).then(
        (data:any) => {
          resolve(data);
        },
        (error:any) => {
          reject(error);
        })
    });
  }

  createPostWithMedia(deployment:Deployment, post:Post) {
    return new Promise((resolve, reject) => {
      let uploads = [];
      for (let value of post.values) {
        if (value.hasPendingImage()) {
          uploads.push(this.uploadImage(deployment, post, value));
        }
        else if (value.hasPendingVideo()) {
          uploads.push(this.uploadVideo(deployment, post, value));
        }
        else if (value.hasPendingAddress()) {
          uploads.push(this.geocodeAddress(deployment, post, value));
        }
      }
      Promise.all(uploads).then(
        (uploaded:any) => {
          this.createPost(deployment, post).then(
            (posted:any) => {
              resolve(posted);
            },
            (error:any) => {
              reject(error);
            });
        },
        (error:any) => {
          reject(error);
        });
      });
  }

  updatePost(deployment:Deployment, post:Post, changes:{}=null) {
    return new Promise((resolve, reject) => {
      if (changes == null) {
        let values = {}
        for (let value of post.values) {
          if (value.value == null || value.value.length == 0) {
            values[value.key] = [];
          }
          else if (value.input == 'number' || value.input == 'upload' || value.input == 'video') {
            values[value.key] = [Number(value.value)];
          }
          else if (value.input == 'location') {
            if (value.value.indexOf(",") > -1) {
              let location = value.value.split(",");
              values[value.key] = [{
                lat: Number(location[0]),
                lon: Number(location[1])}];
            }
            else {
              values[value.key] = [value.value];
            }
          }
          else {
            values[value.key] = [value.value];
          }
        }
        changes = {
          title: post.title,
          content: post.description,
          values: values };
      }
      this.apiPut(deployment, `/api/v3/posts/${post.id}`, changes).then(
        (data:any) => {
          resolve(data);
        },
        (error:any) => {
          reject(error);
        })
    });
  }

  updatePostWithMedia(deployment:Deployment, post:Post) {
    return new Promise((resolve, reject) => {
      let uploads = [];
      for (let value of post.values) {
        if (value.hasPendingImage()) {
          uploads.push(this.uploadImage(deployment, post, value));
        }
        else if (value.hasPendingVideo()) {
          uploads.push(this.uploadVideo(deployment, post, value));
        }
        else if (value.hasPendingAddress()) {
          uploads.push(this.geocodeAddress(deployment, post, value));
        }
      }
      Promise.all(uploads).then(
        (uploaded:any) => {
          this.updatePost(deployment, post).then(
            (posted:any) => {
              resolve(posted);
            },
            (error:any) => {
              reject(error);
            });
        },
        (error:any) => {
          reject(error);
        });
      });
  }

  deletePost(deployment:Deployment, post:Post):Promise<any> {
    return new Promise((resolve, reject) => {
      this.apiDelete(deployment, `/api/v3/posts/${post.id}`).then(
        (data:any) => {
          resolve(data);
        },
        (error:any) => {
          reject(error);
        })
    });
  }

  uploadVideo(deployment:Deployment, post:Post, value:Value):Promise<string> {
    return new Promise((resolve, reject) => {
      let file:string = value.value;
      this.logger.info(this, "uploadVideo", file);
      this.vimeo.uploadVideo(file, post.title, post.description).then(
        (url:any) => {
          this.logger.info(this, "uploadVideo", file, url);
          value.value = url;
          this.database.saveValue(deployment, value).then(
            (saved:any) => {
              resolve(url);
            },
            (error:any) => {
              reject(error);
            });
        },
        (error:any) => {
          this.logger.error(this, "uploadVideo", file, error);
          reject(error);
        });
    });
  }

  getImages(deployment:Deployment, cache:boolean=false, offline:boolean=false, limit:number=10, offset:number=0):Promise<Image[]> {
    return new Promise((resolve, reject) => {
      if (cache || offline) {
        this.database.getImages(deployment, limit, offset).then(
          (images:Image[]) => {
            if (images && images.length >= limit) {
              resolve(images);
            }
            else if (offline) {
              resolve([]);
            }
            else {
              this.getImages(deployment, false, offline, limit, offset).then(
                (images:Image[]) => {
                  resolve(images);
                },
                (error:any) => {
                  reject(error);
                }
              );
            }
          },
          (error:any) => {
            reject(error);
          });
      }
      else {
        let params = {
          order: "desc",
          limit: limit,
          offset: offset };
        this.apiGet(deployment, "/api/v3/media", params).then(
          (data:any) => {
            let saves = [];
            let images = [];
            deployment.images_count = data.total_count;
            saves.push(this.database.saveDeployment(deployment));
            for (let item of data.results) {
              let image:Image = new Image();
              image.deployment_id = deployment.id;
              image.id = item.id;
              if (item.original_file_url) {
                image.url = encodeURI(item.original_file_url);
              }
              image.mime = item.mime;
              image.caption = item.caption;
              image.width = item.original_width;
              image.height = item.original_height;
              image.filesize = item.original_file_size;
              image.created = item.created;
              image.updated = item.updated;
              if (item.allowed_privileges) {
                image.can_read = item.allowed_privileges.indexOf("read") > -1;
                image.can_create = item.allowed_privileges.indexOf("create") > -1;
                image.can_update = item.allowed_privileges.indexOf("update") > -1;
                image.can_delete = item.allowed_privileges.indexOf("delete") > -1;
              }
              else {
                image.can_read = false;
                image.can_create = false;
                image.can_update = false;
                image.can_delete = false;
              }
              images.push(image);
              saves.push(this.database.saveImage(deployment, image));
            }
            Promise.all(saves).then(
              (saved:any) => {
                resolve(images);
              },
              (error:any) => {
                reject(error);
              });
          },
          (error:any) => {
            reject(error);
          });
      }
    });
  }

  uploadImage(deployment:Deployment, post:Post, value:Value):Promise<Image> {
    return new Promise((resolve, reject) => {
      let file = value.value;
      let mimeType = this.mimeType(file);
      this.logger.info(this, "uploadImage", file);
      this.apiUpload(deployment, "/api/v3/media", file, mimeType).then(
        (data:any) => {
          this.logger.info(this, "uploadImage", file, data);
          let item = JSON.parse(data.response);
          let image:Image = new Image();
          image.deployment_id = deployment.id;
          image.id = item.id;
          image.url = item.original_file_url;
          image.mime = item.mime;
          image.caption = item.caption;
          image.width = item.original_width;
          image.height = item.original_height;
          image.filesize = item.original_file_size;
          image.created = item.created;
          image.updated = item.updated;
          if (item.allowed_privileges) {
            image.can_read = item.allowed_privileges.indexOf("read") > -1;
            image.can_create = item.allowed_privileges.indexOf("create") > -1;
            image.can_update = item.allowed_privileges.indexOf("update") > -1;
            image.can_delete = item.allowed_privileges.indexOf("delete") > -1;
          }
          else {
            image.can_read = false;
            image.can_create = false;
            image.can_update = false;
            image.can_delete = false;
          }
          value.value = "" + image.id;
          let saves = [
            this.database.saveImage(deployment, image),
            this.database.saveValue(deployment, value)
          ];
          Promise.all(saves).then(
            (saved:any) => {
              resolve(image);
            },
            (error:any) => {
              reject(error);
            });
        },
        (error:any) => {
          reject(error);
        });
    });
  }

  getForms(deployment:Deployment, cache:boolean=false, offline:boolean=false):Promise<Form[]> {
    return new Promise((resolve, reject) => {
      if (cache || offline) {
        this.database.getForms(deployment).then(
          (forms:Form[]) => {
            if (forms && forms.length > 0) {
              resolve(forms);
            }
            else if (offline) {
              resolve([]);
            }
            else {
              this.getForms(deployment, false, offline).then(
                (forms:Form[]) => {
                  resolve(forms);
                },
                (error:any) => {
                  reject(error);
                });
            }
          },
          (error:any) => {
            reject(error);
          });
      }
      else {
        this.apiGet(deployment, "/api/v3/forms").then(
          (data:any) => {
            let forms = [];
            let saves = [];
            deployment.forms_count = data.total_count;
            saves.push(this.database.saveDeployment(deployment));
            for (let item of data.results) {
              let form:Form = new Form();
              form.deployment_id = deployment.id;
              form.id = item.id;
              form.type = item.type;
              form.name = item.name;
              form.color = item.color;
              form.created = item.created;
              form.updated = item.updated;
              form.disabled = item.disabled;
              form.description = item.description;
              form.can_submit = item.everyone_can_create;
              if (item.can_create) {
                form.user_roles = JSON.stringify(item.can_create);
              }
              if (item.allowed_privileges) {
                form.can_read = item.allowed_privileges.indexOf("read") > -1;
                form.can_create = item.allowed_privileges.indexOf("create") > -1;
                form.can_update = item.allowed_privileges.indexOf("update") > -1;
                form.can_delete = item.allowed_privileges.indexOf("delete") > -1;
              }
              else {
                form.can_read = false;
                form.can_create = false;
                form.can_update = false;
                form.can_delete = false;
              }
              forms.push(form);
              saves.push(this.database.saveForm(deployment, form));
            }
            Promise.all(saves).then(
              (saved:any) => {
                resolve(forms);
              },
              (error:any) => {
                reject(error);
              });
          },
          (error:any) => {
            reject(error);
          });
      }
    });
  }

  getStages(deployment:Deployment, cache:boolean=false, offline:boolean=false):Promise<Stage[]> {
    return new Promise((resolve, reject) => {
      if (cache || offline) {
        this.database.getStages(deployment).then(
          (stages:Stage[]) => {
            if (stages && stages.length > 0) {
              resolve(stages);
            }
            else if (offline) {
              resolve([]);
            }
            else {
              this.getStages(deployment, false, offline).then(
                (stages:Stage[]) => {
                  resolve(stages);
                },
                (error:any) => {
                  reject(error);
                }
              );
            }
          },
          (error:any) => {
            reject(error);
          });
      }
      else {
        this.apiGet(deployment, "/api/v3/forms/stages").then(
          (data:any) => {
            let saves = [];
            let stages = [];
            for (let item of data.results) {
              this.logger.info(this, "getStages", item);
              let stage:Stage = new Stage();
              stage.deployment_id = deployment.id;
              stage.id = item.id;
              stage.form_id = item.form_id;
              stage.label = item.label;
              stage.description = item.description;
              stage.priority = item.priority;
              stage.type = item.type;
              stage.icon = item.icon;
              stage.required = item.required;
              if (item.allowed_privileges) {
                stage.can_read = item.allowed_privileges.indexOf("read") > -1;
                stage.can_create = item.allowed_privileges.indexOf("create") > -1;
                stage.can_update = item.allowed_privileges.indexOf("update") > -1;
                stage.can_delete = item.allowed_privileges.indexOf("delete") > -1;
              }
              else {
                stage.can_read = false;
                stage.can_create = false;
                stage.can_update = false;
                stage.can_delete = false;
              }
              stages.push(stage);
              saves.push(this.database.saveStage(deployment, stage));
            }
            Promise.all(saves).then(
              (saved:any) => {
                resolve(stages);
              },
              (error:any) => {
                reject(error);
              });
          },
          (error:any) => {
            reject(error);
          });
      }
    });
  }

  getAttributes(deployment:Deployment, cache:boolean=false, offline:boolean=false):Promise<Attribute[]> {
    return new Promise((resolve, reject) => {
      if (cache || offline) {
        this.database.getAttributes(deployment).then(
          (attributes:Attribute[]) => {
            if (attributes && attributes.length > 0) {
              resolve(attributes);
            }
            else if (offline) {
              resolve([]);
            }
            else {
              this.getAttributes(deployment, false, offline).then(
                (attributes:Attribute[]) => {
                  resolve(attributes);
                },
                (error:any) => {
                  reject(error);
                }
              );
            }
          },
          (error:any) => {
            reject(error);
          });
      }
      else {
        this.apiGet(deployment, "/api/v3/forms/attributes").then(
          (data:any) => {
            let saves = [];
            let attributes = [];
            for (let item of data.results) {
              this.logger.info(this, "getAttributes", item);
              let attribute:Attribute = new Attribute();
              attribute.deployment_id = deployment.id;
              attribute.id = item.id;
              attribute.form_stage_id = item.form_stage_id;
              attribute.key = item.key;
              attribute.label = item.label;
              attribute.instructions = item.instructions;
              attribute.input = item.input;
              attribute.type = item.type;
              attribute.required = item.required;
              attribute.priority = item.priority;
              attribute.options = item.options;
              attribute.cardinality = item.cardinality;
              if (item.form_id) {
                attribute.form_id = item.form_id;
              }
              if (item.allowed_privileges) {
                attribute.can_read = item.allowed_privileges.indexOf("read") > -1;
                attribute.can_create = item.allowed_privileges.indexOf("create") > -1;
                attribute.can_update = item.allowed_privileges.indexOf("update") > -1;
                attribute.can_delete = item.allowed_privileges.indexOf("delete") > -1;
              }
              else {
                attribute.can_read = false;
                attribute.can_create = false;
                attribute.can_update = false;
                attribute.can_delete = false;
              }
              attributes.push(attribute);
              saves.push(this.database.saveAttribute(deployment, attribute));
            }
            Promise.all(saves).then(
              (saved:any) => {
                resolve(attributes);
              },
              (error:any) => {
                reject(error);
              });
          },
          (error:any) => {
            reject(error);
          });
      }
    });
  }

  getCollections(deployment:Deployment, cache:boolean=false, offline:boolean=false):Promise<Collection[]> {
    return new Promise((resolve, reject) => {
      if (cache || offline) {
        this.database.getCollections(deployment).then(
          (collections:Collection[]) => {
            if (collections && collections.length > 0) {
              resolve(collections);
            }
            else if (offline) {
              resolve([]);
            }
            else {
              this.getCollections(deployment, false, offline).then(
                (collections:Collection[]) => {
                  resolve(collections);
                },
                (error:any) => {
                  reject(error);
                });
            }
          },
          (error:any) => {
            reject(error);
          });
      }
      else {
        this.apiGet(deployment, "/api/v3/collections").then(
          (data:any) => {
            let saves = [];
            let collections = [];
            deployment.collections_count = data.total_count;
            saves.push(this.database.saveDeployment(deployment));
            for (let item of data.results) {
              let collection:Collection = new Collection();
              collection.deployment_id = deployment.id;
              collection.id = item.id;
              collection.name = item.name;
              collection.description = item.description;
              collection.view = item.view;
              collection.options = item.options;
              collection.featured = item.featured;
              collection.created = item.created;
              collection.updated = item.updated;
              if (item.allowed_privileges) {
                collection.can_read = item.allowed_privileges.indexOf("read") > -1;
                collection.can_create = item.allowed_privileges.indexOf("create") > -1;
                collection.can_update = item.allowed_privileges.indexOf("update") > -1;
                collection.can_delete = item.allowed_privileges.indexOf("delete") > -1;
              }
              else {
                collection.can_read = false;
                collection.can_create = false;
                collection.can_update = false;
                collection.can_delete = false;
              }
              collections.push(collection);
              saves.push(this.database.saveCollection(deployment, collection));
            }
            Promise.all(saves).then(
              (saved:any) => {
                resolve(collections);
              },
              (error:any) => {
                reject(error);
              });
          },
          (error:any) => {
            reject(error);
          });
      }
    });
  }

  addPostToCollection(deployment:Deployment, post:Post, collection:Collection) {
    return new Promise((resolve, reject) => {
      let params = {
        id: post.id };
      this.apiPost(deployment, `/api/v3/collections/${collection.id}/posts`, params).then(
        (data:any) => {
          resolve(data);
        },
        (error:any) => {
          reject(error);
        })
    });
  }

  removePostToCollection(deployment:Deployment, post:Post, collection:Collection) {
    return new Promise((resolve, reject) => {
      this.apiDelete(deployment, `/api/v3/collections/${collection.id}/posts/${post.id}`).then(
        (data:any) => {
          resolve(data);
        },
        (error:any) => {
          reject(error);
        })
    });
  }

  getFormsWithAttributes(deployment:Deployment, cache:boolean=false, offline:boolean=false):Promise<Form[]> {
    return new Promise((resolve, reject) => {
      this.logger.info(this, "getFormsWithAttributes", cache);
      Promise.all([
        this.getForms(deployment, cache, offline),
        this.getStages(deployment, cache, offline),
        this.getAttributes(deployment, cache, offline)]).then(
          (results:any[]) => {
            let saves = [];
            let forms = <Form[]>results[0];
            let stages = <Stage[]>results[1];
            let attributes = <Attribute[]>results[2];
            this.logger.info(this, "getFormsWithAttributes", "Forms", forms.length, "Stages", stages.length, "Attributes", attributes.length);
            for (let stage of stages) {
              for (let attribute of attributes) {
                if (attribute.form_stage_id == stage.id) {
                  if (attribute.form_id == null) {
                    attribute.form_id = stage.form_id;
                    saves.push(this.database.saveAttribute(deployment, attribute));
                  }
                }
              }
            }
            for (let form of forms) {
              form.loadStages(stages);
              for (let stage of stages) {
                stage.loadAttributes(attributes);
              }
              form.loadAttributes(attributes);
              this.logger.info(this, "getFormsWithAttributes", "Form", form.name, "Stages", form.stages.length, "Attributes", form.attributes.length);
            }
            return Promise.all(saves).then((saved) => {
              this.logger.info(this, "getFormsWithAttributes", "Saves", saves.length, "Saved");
              resolve(forms);
            });
          },
          (error:any) => {
            this.logger.error(this, "getFormsWithAttributes", error);
            reject(error);
          });
    });
  }

  getPostsWithValues(deployment:Deployment, filter:Filter=null, cache:boolean=false, offline:boolean=false, limit:number=10, offset:number=0):Promise<Post[]> {
    return new Promise((resolve, reject) => {
      this.logger.info(this, "getPostsWithValues", "Filter", filter, "Cache", cache, "Offline", offline, "Limit", limit, "Offset", offset);
      Promise.all([
        this.getPosts(deployment, filter, cache, offline, limit, offset),
        this.getImages(deployment, cache, offline),
        this.getForms(deployment, true, offline),
        this.getUsers(deployment, true, offline),
        this.getAttributes(deployment, true, offline)]).then(
          (results:any[]) => {
            this.logger.info(this, "getPostsWithValues", "Filter", filter, "Cache", cache, "Offline", offline, "Limit", limit, "Offset", offset);
            let posts = <Post[]>results[0];
            let images = <Image[]>results[1];
            let forms = <Form[]>results[2];
            let users = <User[]>results[3];
            let attributes = <Attribute[]>results[4];
            let saves = [];
            for (let post of posts) {
              post.loadUser(users);
              post.loadForm(forms);
              for (let value of post.values) {
                value.loadAttribute(attributes);
                if (value.input == 'upload') {
                  value.loadImage(images);
                  post.loadImage(images, value.value);
                }
                saves.push(this.database.saveValue(deployment, value));
              }
              saves.push(this.database.savePost(deployment, post));
            }
            return Promise.all(saves).then((saved) => {
              this.logger.info(this, "getPostsWithValues", "Filter", filter, "Cache", cache, "Offline", offline, "Limit", limit, "Offset", offset, "Posts", posts.length);
              resolve(posts);
            });
          },
          (error:any) => {
            this.logger.error(this, "getPostsWithValues", "Failed", error);
            reject(error);
          });
    });
  }

  geocodeAddress(deployment:Deployment, post:Post, value:Value):Promise<boolean> {
    return new Promise((resolve, reject) => {
      let address:string = value.value;
      this.logger.info(this, "geocodeAddress", address);
      this.nativeGeocoder.forwardGeocode(address)
        .then((coordinates:NativeGeocoderForwardResult) => {
          this.logger.info(this, "geocodeAddress", address, coordinates);
          post.latitude = Number(coordinates.latitude);
          post.longitude = Number(coordinates.longitude);
          value.value = `${coordinates.latitude},${coordinates.longitude}`;
          let saves = [];
          if (post.isPersisted()) {
            saves.push(this.database.savePost(deployment, post));
          }
          saves.push(this.database.saveValue(deployment, value));
          Promise.all(saves).then(
            (saved:any) => {
              resolve(true);
            },
            (error:any) => {
              reject(error);
            });
        })
        .catch((error:any) => {
          this.logger.error(this, "geocodeAddress", address, error);
          reject(error);
        });
    });
  }

}
