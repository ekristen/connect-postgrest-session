CREATE TABLE sso.sessions (
  sid varchar NOT NULL COLLATE "default" PRIMARY KEY,
	sess jsonb NOT NULL,
	expire bigint NOT NULL
) WITH (OIDS=FALSE);
