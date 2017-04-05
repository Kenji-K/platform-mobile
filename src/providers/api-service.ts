import { Injectable } from '@angular/core';
import { Http } from '@angular/http';

import { Deployment } from '../models/deployment';
import { User } from '../models/user';
import { Form } from '../models/form';
import { Stage } from '../models/stage';
import { Attribute } from '../models/attribute';
import { Post } from '../models/post';
import { Value } from '../models/value';
import { Image } from '../models/image';
import { Collection } from '../models/collection';

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
    public vimeo:VimeoService,
    public logger:LoggerService,
    public database:DatabaseService) {
    super(http, logger);
  }

  searchDeployments(search:string):Promise<Deployment[]> {
    return new Promise((resolve, reject) => {
      let url = "https://api.ushahidi.io/deployments";
      let params = {
        q: search
      };
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
        (error) => {
          reject(error);
        });
    });
  }

  clientLogin(deployment:Deployment):Promise<any> {
    return new Promise((resolve, reject) => {
      let url = deployment.api + "/oauth/token";
      let params = {
        grant_type: "client_credentials",
        scope: this.scope,
        client_id: this.clientId,
        client_secret: this.clientSecret};
      this.httpPost(url, null, params).then(
        (data:any) => {
          let tokens = {
            access_token: data.access_token };
          resolve(tokens);
        },
        (error) => {
          reject(error);
        })
    });
  }

  authLogin(deployment:Deployment, username:string, password:string):Promise<any> {
    return new Promise((resolve, reject) => {
      let url = deployment.api + "/oauth/token";
      let params = {
        grant_type: "password",
        scope: this.scope,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        username: username,
        password: password};
      this.httpPost(url, null, params).then(
        (data:any) => {
          let tokens = {
            username: username,
            password: password,
            access_token: data.access_token,
            refresh_token: data.refresh_token }
          resolve(tokens);
        },
        (error) => {
          reject(error);
        })
    });
  }

  authRefresh(deployment:Deployment, refreshToken:string):Promise<any> {
    return new Promise((resolve, reject) => {
      let url = deployment.api + "/oauth/token";
      let params = {
        grant_type: "refresh_token",
        scope: this.scope,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken};
      this.httpPost(url, null, params).then(
        (data:any) => {
          let tokens = {
            access_token: data.access_token,
            refresh_token: data.refresh_token }
          resolve(tokens);
        },
        (error:any) => {
          reject(error);
        })
    });
  }

  getUsers(deployment:Deployment, cache:boolean=false, offline:boolean=false) : Promise<User[]> {
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
        let url = deployment.api + "/api/v3/users";
        this.httpGet(url, deployment.access_token).then(
          (data:any) => {
            let saves = [];
            let users = [];
            deployment.users_count = data.total_count;
            saves.push(this.database.saveDeployment(deployment));
            for (let item of data.results) {
              let user:User = new User();
              user.id = item.id;
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
              (error) => {
                reject(error);
              });
          },
          (error) => {
            reject(error);
          });
      }
    });
  }

  getUser(deployment:Deployment, user:any="me", cache:boolean=false, offline:boolean=false): Promise<User>  {
    return new Promise((resolve, reject) => {
      let url = deployment.api + `/api/v3/users/${user}`;
      this.httpGet(url, deployment.access_token).then(
        (data:any) => {
          let user:User = new User();
          user.id = data.id;
          user.email = data.email;
          user.name = data.realname;
          user.gravatar = data.gravatar;
          user.image = `https://www.gravatar.com/avatar/${data.gravatar}.jpg?s=32`;
          resolve(user);
        },
        (error) => {
          reject(error);
        });
    });
  }

  getDeployment(deployment:Deployment, cache:boolean=false, offline:boolean=false): Promise<Deployment> {
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
        let url = deployment.api + "/api/v3/config";
        this.httpGet(url, deployment.access_token).then(
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

  updateDeployment(deployment:Deployment, changes:{}=null) {
    return new Promise((resolve, reject) => {
      let url = deployment.api + "/api/v3/config/site";
      if (changes == null) {
        changes = {
          name: deployment.name,
          email: deployment.email,
          description: deployment.description };
      }
      this.httpPut(url, deployment.access_token, changes).then(
        (data:any) => {
          resolve(data);
        },
        (error:any) => {
          reject(error);
        })
    });
  }

  getPosts(deployment:Deployment, cache:boolean=false, offline:boolean=false, limit:number=10, offset:number=0): Promise<Post[]> {
    return new Promise((resolve, reject) => {
      if (cache || offline) {
        this.database.getPosts(deployment, limit, offset).then(
          (posts:Post[]) => {
            if (posts && posts.length > 0) {
              resolve(posts);
            }
            else if (offline) {
              resolve([]);
            }
            else {
              this.getPosts(deployment, false, offline, limit, offset).then(
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
        let url = deployment.api + "/api/v3/posts/";
        let params = {
          limit: limit,
          offset: offset };
        this.httpGet(url, deployment.access_token, params).then(
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
              this.database.getPosts(deployment, limit, offset).then(
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

  createPost(deployment:Deployment, post:Post): Promise<any> {
    return new Promise((resolve, reject) => {
      let url = deployment.api + "/api/v3/posts/";
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
        user: { id: post.user_id },
        form: { id: post.form_id },
        title: post.title,
        content: post.description,
        values: values };
      this.httpPost(url, deployment.access_token, params).then(
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
        if (value.input == 'upload' && value.value && value.value.indexOf("file:") > -1) {
          let file:string = value.value;
          uploads.push(this.uploadImage(deployment, post, file));
        }
        else if (value.input == 'video' && value.value && value.value.indexOf("file:") > -1) {
          let file:string = value.value;
          uploads.push(this.uploadVideo(deployment, post, file));
        }
      }
      Promise.all(uploads).then(
        (uploaded) => {
          this.createPost(deployment, post).then(
            (posted) => {
              resolve(posted);
            },
            (error) => {
              reject(error);
            });
        },
        (error) => {
          reject(error);
        });
      });
  }

  updatePost(deployment:Deployment, post:Post, changes:{}=null) {
    return new Promise((resolve, reject) => {
      let url = deployment.api + `/api/v3/posts/${post.id}`;
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
      this.httpPut(url, deployment.access_token, changes).then(
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
        if (value.input == 'upload' && value.value && value.value.indexOf("file:") > -1) {
          let file:string = value.value;
          uploads.push(this.uploadImage(deployment, post, file));
        }
        else if (value.input == 'video' && value.value && value.value.indexOf("file:") > -1) {
          let file:string = value.value;
          uploads.push(this.uploadVideo(deployment, post, file));
        }
      }
      Promise.all(uploads).then(
        (uploaded) => {
          this.updatePost(deployment, post).then(
            (posted) => {
              resolve(posted);
            },
            (error) => {
              reject(error);
            });
        },
        (error) => {
          reject(error);
        });
      });
  }

  deletePost(deployment:Deployment, post:Post):Promise<any> {
    return new Promise((resolve, reject) => {
      let url = deployment.api + `/api/v3/posts/${post.id}`;
      let params = {};
      this.httpDelete(url, deployment.access_token, params).then(
        (data:any) => {
          resolve(data);
        },
        (error:any) => {
          reject(error);
        })
    });
  }

  uploadVideo(deployment:Deployment, post:Post, file:string): Promise<string> {
    this.logger.info(this, "uploadVideo", file);
    return new Promise((resolve, reject) => {
      this.vimeo.uploadVideo(file, post.title, post.description).then(
        (url:any) => {
          this.logger.info(this, "uploadVideo", url);
          let saves = [];
          for (let value of post.values) {
            if (value.input == 'video' && value.value == file) {
              value.value = url;
              saves.push(this.database.saveValue(deployment, value));
              break;
            }
          }
          Promise.all(saves).then(
            (saved:any) => {
              resolve(url);
            },
            (error:any) => {
              reject(error);
            });
        },
        (error:any) => {
          this.logger.error(this, "uploadVideo", error);
          reject(error);
        });
    });
  }

  getImages(deployment:Deployment, cache:boolean=false, offline:boolean=false, limit:number=10, offset:number=0): Promise<Image[]> {
    return new Promise((resolve, reject) => {
      if (cache || offline) {
        this.database.getImages(deployment, limit, offset).then(
          (images:Image[]) => {
            if (images && images.length > 0) {
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
          (error) => {
            reject(error);
          });
      }
      else {
        let url = deployment.api + "/api/v3/media";
        let params = {
          order: "desc",
          limit: limit,
          offset: offset };
        this.httpGet(url, deployment.access_token, params).then(
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

  uploadImage(deployment:Deployment, post:Post, file:string): Promise<Image> {
    return new Promise((resolve, reject) => {
      let url = deployment.api + "/api/v3/media";
      let mimeType = this.mimeType(file);
      this.fileUpload(url, deployment.access_token, file, "POST", mimeType).then(
        (data:any) => {
          this.logger.info(this, "uploadImage", "Data", data);
          let item = JSON.parse(data.response);
          this.logger.info(this, "uploadImage", "Response", item);
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
          let saves = [
            this.database.saveImage(deployment, image)
          ];
          for (let value of post.values) {
            if (value.input == 'upload' && value.value == file) {
              value.value = "" + image.id;
              saves.push(this.database.saveValue(deployment, value));
              break;
            }
          }
          Promise.all(saves).then(
            (saved:any) => {
              resolve(image);
            },
            (error:any) => {
              reject(error);
            });
        },
        (error) => {
          reject(error);
        });
    });
  }

  getForms(deployment:Deployment, cache:boolean=false, offline:boolean=false): Promise<Form[]> {
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
        let url = deployment.api + "/api/v3/forms";
        this.httpGet(url, deployment.access_token).then(
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
              form.description = item.description;
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

  getStages(deployment:Deployment, cache:boolean=false, offline:boolean=false): Promise<Stage[]> {
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
        let url = deployment.api + "/api/v3/forms/stages";
        this.httpGet(url, deployment.access_token).then(
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

  getAttributes(deployment:Deployment, cache:boolean=false, offline:boolean=false): Promise<Attribute[]> {
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
        let url = deployment.api + "/api/v3/forms/attributes";
        this.httpGet(url, deployment.access_token).then(
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

  getCollections(deployment:Deployment, cache:boolean=false, offline:boolean=false): Promise<Collection[]> {
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
        let url = deployment.api + "/api/v3/collections";
        this.httpGet(url, deployment.access_token).then(
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
          (error) => {
            reject(error);
          });
      }
    });
  }

  addPostToCollection(deployment:Deployment, post:Post, collection:Collection) {
    return new Promise((resolve, reject) => {
      let url = deployment.api + `/api/v3/collections/${collection.id}/posts`;
      let params = {
        id: post.id };
      this.httpPost(url, deployment.access_token, params).then(
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
      let url = deployment.api + `/api/v3/collections/${collection.id}/posts/${post.id}`;
      let params = { };
      this.httpDelete(url, deployment.access_token, params).then(
        (data:any) => {
          resolve(data);
        },
        (error:any) => {
          reject(error);
        })
    });
  }

  getFormsWithAttributes(deployment:Deployment, cache:boolean=false, offline:boolean=false): Promise<Form[]> {
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

  getPostsWithValues(deployment:Deployment, cache:boolean=false, offline:boolean=false, limit:number=10, offset:number=0):Promise<Post[]> {
    return new Promise((resolve, reject) => {
      this.logger.info(this, "getPostsWithValues", "Cache", cache, "Offline", offline, "Limit", limit, "Offset", offset);
      Promise.all([
        this.getPosts(deployment, cache, offline, limit, offset),
        this.getImages(deployment, cache, offline),
        this.getForms(deployment, true, offline),
        this.getUsers(deployment, true, offline),
        this.getAttributes(deployment, true, offline)]).then(
          (results:any[]) => {
            this.logger.info(this, "getPostsWithValues", "Cache", cache, "Offline", offline, "Limit", limit, "Offset", offset);
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
              this.logger.info(this, "getPostsWithValues", "Cache", cache, "Offline", offline, "Limit", limit, "Offset", offset, "Posts", posts.length);
              resolve(posts);
            });
          },
          (error:any) => {
            this.logger.error(this, "getPostsWithValues", "Failed", error);
            reject(error);
          });
    });
  }

}
