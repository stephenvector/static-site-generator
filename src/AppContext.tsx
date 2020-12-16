import React from "react";

export interface IAppContext {
  site: {
    name: string;
    description: string;
  };
  docs: {
    title: string;
    slug: string;
    content: string;
  }[];
}
