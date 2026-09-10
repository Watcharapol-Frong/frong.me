/// <reference path="../worker-configuration.d.ts" />

declare namespace App {
  interface Locals {
    owner?: {
      email: string;
      subject: string;
    };
  }
}
