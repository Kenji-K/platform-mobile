import { Injectable } from '@angular/core';
import { Platform } from 'ionic-angular';
import { SQLite, SQLiteObject } from '@ionic-native/sqlite';

import { Model, TEXT, INTEGER, DOUBLE, BOOLEAN } from '../models/model';
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

import { LoggerService } from '../providers/logger-service';

@Injectable()
export class DatabaseService {

  protected database:SQLiteObject = null;
  protected name:string = 'ushahidi.db';
  protected location:string = 'default';

  constructor(
    public sqlite: SQLite,
    public platform:Platform,
    public logger:LoggerService) {
  }

  testDatabase() {
    return this.platform.platforms().indexOf('cordova') >= 0;
  }

  openDatabase():Promise<SQLiteObject> {
    return new Promise((resolve, reject) => {
      if (this.database) {
        resolve(this.database);
      }
      else if (this.testDatabase()) {
        this.sqlite.create({
          name: this.name,
          location: this.location
        }).then(
          (database:SQLiteObject) => {
            this.logger.info(this, "openDatabase", "Opened", database);
            this.database = database;
            resolve(database);
          },
          (error) => {
            this.logger.error(this, "openDatabase", "Failed", error);
            reject(JSON.stringify(error));
          });
      }
      else {
        this.logger.error(this, "openDatabase", "Failed", "Cordova Not Available");
        reject(`Error Opening Database`);
      }
    });
  }

  deleteDatabase() {
    this.logger.info(this, "deleteDatabase");
    return new Promise((resolve, reject) => {
      this.sqlite.deleteDatabase({
        name: this.name,
        location: this.location }).then(
          (deleted) => {
            this.database = null;
            this.logger.info(this, "deleteDatabase", "Deleted");
            resolve();
          },
          (error) => {
            this.logger.error(this, "deleteDatabase", "Failed", error);
            reject(error);
      });
    });
  }

  createTables(models:Model[]):Promise<any> {
    let creates = [];
    for (let model of models) {
      creates.push(this.createTable(model));
    }
    return Promise.all(creates);
  }

  createTable<M extends Model>(model:M):Promise<any> {
    return new Promise((resolve, reject) => {
      this.openDatabase().then(
        (database:SQLiteObject) => {
          let table:string = model.getTable();
          let columns:any[] = model.getColumns();
          this.logger.info(this, "createTable", table, columns);
          let keys:string[] = [];
          let values:string[] = [];
          for (let column of columns) {
            values.push(column.name + ' ' + column.type);
            if (column.key == true) {
              keys.push(column.name);
            }
          }
          let key = "";
          if (keys.length > 0) {
            key = `, PRIMARY KEY (${keys.join(", ")})`;
          }
          let sql = `CREATE TABLE IF NOT EXISTS ${table} (${values.join(", ")}${key})`;
          this.logger.info(this, "createTable", "Creating", sql);
          database.executeSql(sql, []).then(
            (data) => {
              this.logger.info(this, "createTable", "Created", sql, data);
              resolve(data);
            },
            (error) => {
              this.logger.error(this, "createTable", "Failed", sql, error);
              reject(JSON.stringify(error));
            });
      },
      (error) => {
        this.logger.error(this, "createTable", "Failed", error);
        reject(`Error Creating Database Tables`);
      });
    });
  }

  executeFirst(table:string, where:{}=null, order:{}=null):Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.executeSelect(table, where, order, 1, 0).then(rows => {
        let results = <any[]>rows;
        if (results && results.length > 0) {
          resolve(results[0]);
        }
        else {
          reject("No Results");
        }
      });
    });
  }

  executeTest(table:string, columns:any):Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.openDatabase().then((database:SQLiteObject) => {
        let statement = this.testStatement(table, columns);
        let parameters = [];
        this.logger.info(this, "executeTest", "Testing", statement);
        database.executeSql(statement, parameters).then(
          (data) => {
            this.logger.info(this, "executeTest", "Tested", statement);
            resolve(true);
          },
          (error) => {
            this.logger.error(this, "executeTest", "Failed", statement, error);
            reject(JSON.stringify(error));
          });
      },
      (error) => {
        this.logger.error(this, "executeSelect", "Failed", error);
        reject(error);
      });
    });
  }

  executeSelect(table:string, where:{}=null, order:{}=null, limit:number=null, offset:number=null):Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.openDatabase().then((database:SQLiteObject) => {
        let statement = this.selectStatement(table, where, order, limit, offset);
        let parameters = this.selectParameters(table, where, order);
        this.logger.info(this, "executeSelect", "Selecting", statement, parameters);
        database.executeSql(statement, parameters).then(
          (data) => {
            let results = [];
            if (data.rows && data.rows.length > 0) {
              for (let i = 0; i < data.rows.length; i++) {
                let row = data.rows.item(i);
                this.logger.info(this, "executeSelect", table, row);
                results.push(row);
              }
            }
            this.logger.info(this, "executeSelect", "Selected", statement, results);
            resolve(results);
          },
          (error) => {
            this.logger.error(this, "executeSelect", "Failed", statement, error);
            reject(JSON.stringify(error));
          });
      },
      (error) => {
        this.logger.error(this, "executeSelect", "Failed", error);
        reject(error);
      });
    });
  }

  executeInsert(table:string, columns:any, values:{}) {
    return new Promise((resolve, reject) => {
      this.openDatabase().then((database:SQLiteObject) => {
        let statement = this.insertStatement(table, columns, values);
        let parameters = this.insertParameters(table, columns, values);
        this.logger.info(this, "executeInsert", "Inserting", statement, parameters);
        database.executeSql(statement, parameters).then(
          (results) => {
            this.logger.info(this, "executeInsert", "Inserted", statement, parameters, results);
            resolve(results['insertId']);
          },
          (error) => {
            this.logger.error(this, "executeInsert", "Failed", statement, parameters, error);
            reject(JSON.stringify(error));
          });
      },
      (error) => {
        this.logger.error(this, "executeInsert", "Failed", error);
        reject(JSON.stringify(error));
      });
    });
  }

  executeUpdate(table:string, columns:any[], values:{}) {
    return new Promise((resolve, reject) => {
      this.openDatabase().then((database:SQLiteObject) => {
        let statement = this.updateStatement(table, columns, values);
        let parameters = this.updateParameters(table, columns, values);
        this.logger.info(this, "executeUpdate", "Updating", statement, parameters);
        database.executeSql(statement, parameters).then(
          (results) => {
            this.logger.info(this, "executeUpdate", "Updated", statement, parameters, results);
            resolve(true);
          },
          (error) => {
            this.logger.error(this, "executeUpdate", "Failed", statement, parameters, error);
            reject(JSON.stringify(error));
          });
      },
      (error) => {
        this.logger.error(this, "executeUpdate", "Failed", error);
        reject(JSON.stringify(error));
      });
    });
  }

  executeDelete(table:string, where:{}) {
    return new Promise((resolve, reject) => {
      this.openDatabase().then((database:SQLiteObject) => {
        let statement = this.deleteStatement(table, where);
        this.logger.info(this, "executeDelete", "Deleting", statement);
        database.executeSql(statement, []).then(
          (results) => {
            this.logger.info(this, "executeDelete", "Deleted", statement, results);
            resolve(results['insertId']);
          },
          (error) => {
            this.logger.error(this, "executeDelete", "Failed", statement, error);
            reject(JSON.stringify(error));
          });
      },
      (error) => {
        this.logger.error(this, "executeDelete", "Failed", error);
        reject(JSON.stringify(error));
      });
    });
  }

  testStatement(table:string, columns:any[]):string {
    let query = [`SELECT`];
    let names = [];
    for (let column of columns) {
      names.push(column.name);
    }
    query.push(names.join(", "));
    query.push(`FROM ${table}`);
    query.push(`LIMIT 0`);
    return query.join(" ");
  }

  selectStatement(table:string, where:{}=null, order:{}=null, limit:number=null, offset:number=null) {
    let query = [`SELECT * FROM ${table}`];
    if (where != null && Object.keys(where).length > 0) {
      let clause = [];
      for (let column in where) {
        let parameter = where[column];
        if (Array.isArray(parameter)) {
          let inClause = [];
          for (let i = 0; i < parameter.length; i++) {
            inClause.push("?");
          }
          clause.push(`${column} IN (${inClause.join(', ')})`);
        }
        else if (parameter.toString().indexOf("%") != -1){
          clause.push(`${column} LIKE ?`);
        }
        else {
          clause.push(`${column} = ?`);
        }
      }
      query.push(`WHERE ${clause.join(' AND ')}`);
    }
    if (order != null && Object.keys(order).length > 0) {
      let sort = [];
      for (let column in order) {
        sort.push(`${column} ${order[column]}`);
      }
      query.push(`ORDER BY ${sort.join(', ')}`);
    }
    if (limit != null) {
      query.push(`LIMIT ${limit}`);
    }
    if (offset != null) {
      query.push(`OFFSET ${offset}`);
    }
    return query.join(" ");
  }

  selectParameters(table:string, where:{}=null, order:{}=null): any[] {
    let parameters = [];
    if (where != null && Object.keys(where).length > 0) {
      for (let column in where) {
        let parameter = where[column];
        if (Array.isArray(parameter)) {
          for (let param of parameter) {
            parameters.push(param);
          }
        }
        else {
          parameters.push(parameter);
        }
      }
    }
    return parameters;
  }

  insertStatement(table:string, columns:any[], values:{}) : string {
    let names = [];
    let params = [];
    for (let column of columns) {
      let value = values[column.name];
      if (value != null) {
        names.push(column.name);
        params.push("?");
      }
    }
    return `INSERT OR REPLACE INTO ${table} (${names.join(", ")}) VALUES (${params.join(", ")})`;
  }

  insertParameters(table:string, columns:any[], values:{}) : any {
    let params:any[] = [];
    for (let column of columns) {
      let value = values[column.name];
      if (value != null) {
        params.push(value);
      }
    }
    return params;
  }

  updateStatement(table:string, columns:any[], values:{}) : string {
    let params:any[] = [];
    let clause = [];
    for (let column of columns) {
      if (column.key == true) {
        clause.push(`${column.name} = ?`);
      }
      else if (column.property in values) {
        params.push(`${column.name} = ?`);
      }
    }
    return `UPDATE ${table} SET ${params.join(", ")} WHERE ${clause.join(" AND ")}`;
  }

  updateParameters(table:string, columns:any[], values:{}) : any {
    let params:any[] = [];
    let clause = [];
    for (let column of columns) {
      let value = values[column.property];
      if (column.key == true) {
        clause.push(value);
      }
      else if (column.property in values) {
        params.push(value);
      }
    }
    return params.concat(clause);
  }

  deleteStatement(table:string, where:{}) : string {
    let clause = [];
    for (let column in where) {
      clause.push(`${column} = '${where[column]}'`);
    }
    return `DELETE FROM ${table} WHERE ${clause.join(' AND ')}`;
  }

  testModel<M extends Model>(type:M):Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.executeTest(type.getTable(), type.getColumns()).then(
        (rows:any) => {
          resolve(true);
        },
        (error:any) => {
          reject(error);
        });
    });
  }

  getModels<M extends Model>(type:M, where:{}=null, order:{}=null, limit:number=null, offset:number=null):Promise<M[]> {
    return new Promise((resolve, reject) => {
      this.executeSelect(type.getTable(), where, order, limit, offset).then(
        (rows:any) => {
          let models = [];
          let columns = type.getColumns();
          for (let i = 0; i < rows.length; i++) {
            let row = rows[i];
            let values = {};
            for (let column of columns) {
              if (column.type == INTEGER) {
                values[column.property] = row[column.name];
              }
              else if (column.type == DOUBLE) {
                values[column.property] = row[column.name];
              }
              else if (column.type == BOOLEAN) {
                values[column.property] = (row[column.name] == 'true');
              }
              else if (column.type == TEXT) {
                values[column.property] = row[column.name];
              }
              else {
                values[column.property] = row[column.name];
              }
            }
            let model = type.newInstance<M>(values);
            models.push(model);
          }
          resolve(models);
        },
        (error:any) => {
          reject(error);
        });
    });
  }

  getModel<M extends Model>(type:M, where:{}=null, order:{}=null):Promise<M> {
    return new Promise((resolve, reject) => {
      this.executeFirst(type.getTable(), where, order).then(
        (row:any) => {
          let columns = type.getColumns();
          let values = {};
          for (let column of columns) {
            if (column.type == INTEGER) {
              values[column.property] = row[column.name];
            }
            else if (column.type == DOUBLE) {
              values[column.property] = row[column.name];
            }
            else if (column.type == BOOLEAN) {
              values[column.property] = (row[column.name] == 'true');
            }
            else if (column.type == TEXT) {
              values[column.property] = row[column.name];
            }
            else {
              values[column.property] = row[column.name];
            }
          }
          let model = type.newInstance<M>(values);
          resolve(model);
        },
        (error:any) => {
          reject(error);
        });
    });
  }

  saveModel<M extends Model>(model:M) {
    return new Promise((resolve, reject) => {
      let table:string = model.getTable();
      let columns:any[] = model.getColumns();
      let values:any[] = model.getValues();
      if (model.isPersisted()) {
        this.logger.info(this, "saveModel", "Updating", model);
        values['saved'] = new Date();
        this.executeUpdate(table, columns, values).then(
          (results) => {
            resolve(results);
          },
          (error) => {
            reject(error);
          });
      }
      else {
        this.logger.info(this, "saveModel", "Inserting", model);
        values['saved'] = new Date();
        this.executeInsert(table, columns, values).then(
          (results) => {
            resolve(results);
          },
          (error) => {
            reject(error);
          });
      }
    });
  }

  removeModel<M extends Model>(model:M, where:any) {
    return this.executeDelete(model.getTable(), where);
  }

  getMinium<M extends Model>(type:M, column:string):Promise<number> {
    return new Promise((resolve, reject) => {
      this.openDatabase().then((database:SQLiteObject) => {
        let statement = `SELECT MIN(${column}) as value FROM ${type.getTable()}`;
        database.executeSql(statement, []).then(
          (data) => {
            this.logger.info(this, "getMinium", type.getTable(), column, data);
            if (data.rows && data.rows.length > 0) {
              let row = data.rows.item(0);
              resolve(row.value);
            }
            else {
              resolve(0);
            }
          },
          (error) => {
            this.logger.error(this, "executeSelect", "Failed", statement, error);
            reject(JSON.stringify(error));
          });
      });
    });
  }

  saveDeployment(deployment:Deployment) {
    return this.saveModel(deployment);
  }

  getDeployments(where:{}=null, order:{}=null):Promise<Deployment[]> {
    return this.getModels<Deployment>(new Deployment(), where, order);
  }

  getDeployment(id:number):Promise<Deployment> {
    let where = { id: id };
    return this.getModel<Deployment>(new Deployment(), where);
  }

  removeDeployment(deployment:Deployment) {
    let where = { id: deployment.id };
    return this.removeModel<Deployment>(new Deployment(), where);
  }

  getForms(deployment:Deployment):Promise<Form[]> {
    let where = { deployment_id: deployment.id };
    let order = { name: "ASC" };
    return this.getModels<Form>(new Form(), where, order);
  }

  getForm(deployment:Deployment, id:number):Promise<Form> {
    let where = {
      deployment_id: deployment.id,
      id: id };
    return this.getModel<Form>(new Form(), where);
  }

  saveForm(deployment:Deployment, form:Form) {
    form.deployment_id = deployment.id;
    return this.saveModel(form);
  }

  removeForms(deployment:Deployment) {
    let where = { deployment_id: deployment.id };
    return this.removeModel<Form>(new Form(), where);
  }

  getUsers(deployment:Deployment):Promise<User[]> {
    let where = { deployment_id: deployment.id };
    let order = {};
    return this.getModels<User>(new User(), where, order);
  }

  saveUser(deployment:Deployment, user:User) {
    user.deployment_id = deployment.id;
    return this.saveModel(user);
  }

  removeUsers(deployment:Deployment) {
    let where = { deployment_id: deployment.id };
    return this.removeModel<User>(new User(), where);
  }

  getPosts(deployment:Deployment, filter:Filter=null, limit:number=null, offset:number=null):Promise<Post[]> {
    let postsWhere = { deployment_id: deployment.id };
    let valuesWhere = { deployment_id: deployment.id };
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
      postsWhere['status'] = statuses;
    }
    if (filter && filter.show_forms && filter.show_forms.length > 0) {
      postsWhere['form_id'] = filter.show_forms.split(",");
    }
    if (filter && filter.search_text && filter.search_text.length > 0) {
      postsWhere['title'] = `%${ filter.search_text}%`;
    }
    return Promise.all([
      this.getModels<Post>(new Post(), postsWhere, { created: "DESC" }, limit, offset),
      this.getModels<Value>(new Value(), valuesWhere, { cardinality: "ASC" })]).
      then((results:any[]) => {
        let posts = <Post[]>results[0];
        let values = <Value[]>results[1];
        for (let post of posts) {
          post.loadValues(values);
        }
        this.logger.info(this, "getPosts", posts.length);
        return posts;
      });
  }

  getPostsPending(deployment:Deployment):Promise<Post[]> {
    let where = { deployment_id: deployment.id, pending: true };
    let order = { created: "DESC" };
    return this.getModels<Post>(new Post(), where, order);
  }

  getPost(deployment:Deployment, id:number):Promise<Post> {
    let where = {
      deployment_id: deployment.id,
      id: id };
    return this.getModel<Post>(new Post(), where);
  }

  savePost(deployment:Deployment, post:Post) {
    post.deployment_id = deployment.id;
    return this.saveModel(post);
  }

  removePosts(deployment:Deployment) {
    let where = { deployment_id: deployment.id };
    return this.removeModel<Post>(new Post(), where);
  }

  removePost(deployment:Deployment, post:Post) {
    let where = {
      deployment_id: deployment.id,
      id: post.id };
    return this.removeModel<Post>(new Post(), where);
  }

  getPostsLowestID():Promise<number> {
    return this.getMinium<Post>(new Post(), "id");
  }

  getImages(deployment:Deployment, limit:number=null, offset:number=null):Promise<Image[]> {
    let where = { deployment_id: deployment.id };
    let order = { created: "DESC" };
    return this.getModels<Image>(new Image(), where, order, limit, offset);
  }

  getImage(deployment:Deployment, id:number):Promise<Image> {
    let where = { deployment_id: deployment.id, id: id };
    return this.getModel<Image>(new Image(), where);
  }

  saveImage(deployment:Deployment, image:Image) {
    image.deployment_id = deployment.id;
    return this.saveModel(image);
  }

  removeImages(deployment:Deployment) {
    let where = { deployment_id: deployment.id };
    return this.removeModel<Image>(new Image(), where);
  }

  getPostsWithValues(deployment:Deployment):Promise<Post[]> {
    return new Promise((resolve, reject) => {
      Promise.all([
        this.getPosts(deployment),
        this.getValues(deployment),
        this.getUsers(deployment),
        this.getForms(deployment)]).then(
          (results:any[]) => {
            let posts = <Post[]>results[0];
            let values = <Value[]>results[1];
            let users = <User[]>results[2];
            let forms = <Form[]>results[3];
            for (let post of posts) {
              post.loadUser(users);
              post.loadForm(forms);
              post.loadValues(values);
            }
            resolve(posts);
          },
          (error:any) => {
            reject(error);
          });
    });
  }

  getAttributes(deployment:Deployment, form_id:number=null):Promise<Attribute[]> {
    let where = { deployment_id: deployment.id };
    if (form_id != null) {
      where['form_id'] = form_id;
    }
    let order = { priority: "ASC" };
    return this.getModels<Attribute>(new Attribute(), where, order);
  }

  saveAttribute(deployment:Deployment, attribute:Attribute) {
    attribute.deployment_id = deployment.id;
    return this.saveModel(attribute);
  }

  removeAttributes(deployment:Deployment) {
    let where = { deployment_id: deployment.id };
    return this.removeModel<Attribute>(new Attribute(), where);
  }

  getFormsWithAttributes(deployment:Deployment):Promise<Form[]> {
    return new Promise((resolve, reject) => {
      Promise.all([
        this.getForms(deployment),
        this.getStages(deployment),
        this.getAttributes(deployment)]).then(
          (results:any[]) => {
            let forms:Form[] = <Form[]>results[0];
            let stages:Stage[] = <Stage[]>results[1];
            let attributes:Attribute[] = <Attribute[]>results[2];
            for (let form of forms) {
              form.loadStages(stages);
              for (let stage of stages) {
                stage.loadAttributes(attributes);
              }
              form.loadAttributes(attributes);
            }
            resolve(forms);
          },
          (error:any) => {
            reject(error);
          });
    });
  }

  getFormWithAttributes(deployment:Deployment, id:number):Promise<Form> {
    return new Promise((resolve, reject) => {
      Promise.all([
        this.getForm(deployment, id),
        this.getStages(deployment, id),
        this.getAttributes(deployment, id)]).then(
          (results:any[]) => {
            let form:Form = <Form>results[0];
            let stages:Stage[] = <Stage[]>results[1];
            let attributes:Attribute[] = <Attribute[]>results[2];
            form.loadStages(stages);
            for (let stage of stages) {
              stage.loadAttributes(attributes);
            }
            form.loadAttributes(attributes);
            resolve(form);
          },
          (error:any) => {
            reject(error);
          });
    });
  }

  getStages(deployment:Deployment, form_id:number=null):Promise<Stage[]> {
    let where = { deployment_id: deployment.id };
    if (form_id != null) {
      where['form_id'] = form_id;
    }
    let order = { priority: "ASC" };
    return this.getModels<Stage>(new Stage(), where, order);
  }

  saveStage(deployment:Deployment, stage:Stage) {
    stage.deployment_id = deployment.id;
    return this.saveModel(stage);
  }

  removeStages(deployment:Deployment) {
    let where = { deployment_id: deployment.id };
    return this.removeModel<Stage>(new Stage(), where);
  }

  getValues(deployment:Deployment, post:Post=null):Promise<Value[]> {
    let where:any = { deployment_id: deployment.id };
    if (post != null) {
      where['post_id'] = post.id;
    }
    let order = { cardinality: "ASC" };
    return this.getModels<Value>(new Value(), where, order);
  }

  saveValue(deployment:Deployment, value:Value) {
    value.deployment_id = deployment.id;
    return this.saveModel(value);
  }

  removeValues(deployment:Deployment, post:Post=null) {
    let where = { deployment_id: deployment.id };
    if (post != null) {
      where['post_id'] = post.id;
    }
    return this.removeModel<Value>(new Value(), where);
  }

  getFilter(deployment:Deployment):Promise<Filter> {
    let where:any = { deployment_id: deployment.id };
    return this.getModel<Filter>(new Filter(), where);
  }

  saveFilter(deployment:Deployment, filter:Filter) {
    filter.deployment_id = deployment.id;
    return this.saveModel(filter);
  }

  removeFilters(deployment:Deployment) {
    let where = { deployment_id: deployment.id };
    return this.removeModel<Filter>(new Filter(), where);
  }

  getCollections(deployment:Deployment):Promise<Collection[]> {
    let where:any = { deployment_id: deployment.id };
    let order = { name: "ASC" };
    return this.getModels<Collection>(new Collection(), where, order);
  }

  saveCollection(deployment:Deployment, collection:Collection) {
    collection.deployment_id = deployment.id;
    return this.saveModel(collection);
  }

  removeCollections(deployment:Deployment) {
    let where = { deployment_id: deployment.id };
    return this.removeModel<Collection>(new Collection(), where);
  }

}
