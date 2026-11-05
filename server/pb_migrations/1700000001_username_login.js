/// <reference path="../pb_data/types.d.ts" />
// Log in with a username + password instead of an email address.
// No email is collected or stored.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  // Email becomes optional (and the sign-up form never sends one).
  const email = users.fields.getByName("email");
  email.required = false;

  // "name" is the username: required, unique (ignoring capitals), letters/numbers/_ only.
  const name = users.fields.getByName("name");
  name.required = true;
  name.min = 3;
  name.max = 30;
  name.pattern = "^[A-Za-z0-9_]+$";
  users.addIndex("idx_users_name_unique", true, "name COLLATE NOCASE", "");

  // Log in with the username.
  users.passwordAuth.identityFields = ["name"];

  // Nobody can set an email on their account through the site.
  users.createRule = "@request.body.email:isset = false";
  users.updateRule = "id = @request.auth.id && @request.body.email:isset = false";

  // Turn off login methods that rely on email.
  users.otp.enabled = false;
  users.mfa.enabled = false;
  users.oauth2.enabled = false;

  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.removeIndex("idx_users_name_unique");
  users.fields.getByName("email").required = true;
  const name = users.fields.getByName("name");
  name.required = false; name.min = 0; name.max = 255; name.pattern = "";
  users.passwordAuth.identityFields = ["email"];
  users.createRule = "";
  users.updateRule = "id = @request.auth.id";
  app.save(users);
});
