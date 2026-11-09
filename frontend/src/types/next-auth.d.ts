import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    userKey?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userKey?: string;
  }
}
