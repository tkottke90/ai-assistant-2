import express from 'express';

export default function setupStaticController(app: express.Application) {
  
  app.get('/', express.static('public/'));
}