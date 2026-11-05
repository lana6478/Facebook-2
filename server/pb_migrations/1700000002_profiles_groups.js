/// <reference path="../pb_data/types.d.ts" />
// Version 2: you must log in to see anything, everyone edits their own profile,
// chat groups (invite-only, the creator is the group's admin) and site admins.
//
// Site admins are users with "is_admin" ticked. Only a superuser (in the dashboard)
// or another site admin can tick it.

const ADMIN = "@request.auth.is_admin = true";
const LOGGED_IN = "@request.auth.id != ''";

migrate((app) => {
  // ---------- Users: profile fields + admin flag ----------
  const users = app.findCollectionByNameOrId("users");

  users.fields.add(new BoolField({ name: "is_admin" }));
  // Profile picture: PocketBase's built-in "avatar" field, with small copies for the page.
  const avatar = users.fields.getByName("avatar");
  avatar.maxSize = 5 * 1024 * 1024;
  avatar.mimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  avatar.thumbs = ["140x170", "50x50"];
  for (const [name, max] of [
    ["full_name", 60], ["school", 80], ["status", 60], ["concentration", 80],
    ["residence", 80], ["looking_for", 120], ["relationship", 60], ["about", 2000],
  ]) {
    users.fields.add(new TextField({ name, max }));
  }

  // Only logged-in people can see who's on the site.
  users.listRule = LOGGED_IN;
  users.viewRule = LOGGED_IN;
  // Sign-up: no email, can't make yourself an admin.
  users.createRule = "@request.body.email:isset = false && @request.body.is_admin:isset = false";
  // Edit your own profile (but not your admin flag); site admins can edit anyone.
  users.updateRule = `(id = @request.auth.id && @request.body.email:isset = false && @request.body.is_admin:isset = false) || ${ADMIN}`;
  users.deleteRule = ADMIN;
  // Lets site admins set a new password for someone who forgot theirs.
  users.manageRule = ADMIN;
  app.save(users);

  // ---------- The central Wall: now members only; admins can remove anything ----------
  const posts = app.findCollectionByNameOrId("posts");
  posts.listRule = LOGGED_IN;
  posts.viewRule = LOGGED_IN;
  posts.updateRule = `(author = @request.auth.id && (@request.body.author:isset = false || @request.body.author = @request.auth.id)) || ${ADMIN}`;
  posts.deleteRule = `author = @request.auth.id || ${ADMIN}`;
  app.save(posts);

  // ---------- Chat groups ----------
  const groups = new Collection({
    type: "base",
    name: "groups",
    fields: [
      { type: "text", name: "name", required: true, min: 1, max: 60 },
      { type: "relation", name: "owner", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
  });
  app.save(groups);

  // Who is in which group. Only the group's owner (or a site admin) can add people.
  const members = new Collection({
    type: "base",
    name: "members",
    fields: [
      { type: "relation", name: "group", required: true, collectionId: groups.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_members_group_user ON members ("group", "user")'],
  });
  app.save(members);

  const isMember = (groupField) => `${groupField}.members_via_group.user ?= @request.auth.id`;

  // You see a group if you're in it (or you're a site admin).
  groups.listRule = `members_via_group.user ?= @request.auth.id || owner = @request.auth.id || ${ADMIN}`;
  groups.viewRule = groups.listRule;
  groups.createRule = `${LOGGED_IN} && owner = @request.auth.id`;
  // The owner can rename it; only a site admin can hand it to someone else.
  groups.updateRule = `(owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)) || ${ADMIN}`;
  groups.deleteRule = `owner = @request.auth.id || ${ADMIN}`;
  app.save(groups);

  members.listRule = `user = @request.auth.id || ${isMember("group")} || group.owner = @request.auth.id || ${ADMIN}`;
  members.viewRule = members.listRule;
  members.createRule = `group.owner = @request.auth.id || ${ADMIN}`;
  members.updateRule = null; // nobody edits a membership; remove and re-add instead
  // You can leave; the owner can remove people.
  members.deleteRule = `user = @request.auth.id || group.owner = @request.auth.id || ${ADMIN}`;
  app.save(members);

  // ---------- Messages inside a group ----------
  const messages = new Collection({
    type: "base",
    name: "messages",
    fields: [
      { type: "relation", name: "group", required: true, collectionId: groups.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "author", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "body", required: true, max: 5000 },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ['CREATE INDEX idx_messages_group_created ON messages ("group", created)'],
  });
  app.save(messages);

  messages.listRule = `${isMember("group")} || ${ADMIN}`;
  messages.viewRule = messages.listRule;
  messages.createRule = `author = @request.auth.id && ${isMember("group")}`;
  messages.updateRule = `author = @request.auth.id && @request.body.author:isset = false && @request.body.group:isset = false`;
  // Delete your own message; the group owner and site admins can delete any.
  messages.deleteRule = `author = @request.auth.id || group.owner = @request.auth.id || ${ADMIN}`;
  app.save(messages);
}, (app) => {
  for (const name of ["messages", "members", "groups"]) {
    app.delete(app.findCollectionByNameOrId(name));
  }
  const posts = app.findCollectionByNameOrId("posts");
  posts.listRule = "";
  posts.viewRule = "";
  posts.updateRule = "author = @request.auth.id && (@request.body.author:isset = false || @request.body.author = @request.auth.id)";
  posts.deleteRule = "author = @request.auth.id";
  app.save(posts);

  const users = app.findCollectionByNameOrId("users");
  for (const name of ["is_admin", "full_name", "school", "status", "concentration",
                      "residence", "looking_for", "relationship", "about"]) {
    users.fields.removeByName(name);
  }
  users.listRule = "";
  users.viewRule = "";
  users.createRule = "@request.body.email:isset = false";
  users.updateRule = "id = @request.auth.id && @request.body.email:isset = false";
  users.deleteRule = "id = @request.auth.id";
  users.manageRule = null;
  app.save(users);
});
