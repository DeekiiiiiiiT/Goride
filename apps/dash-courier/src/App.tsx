import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { CourierConsumerApp } from '@/CourierConsumerApp';
import { CourierAdminPortal } from '@/admin/CourierAdminPortal';

export default function App() {
  if (window.location.pathname.startsWith('/admin')) {
    return (
      <BrowserRouter basename="/admin">
        <CourierAdminPortal />
      </BrowserRouter>
    );
  }

  return <CourierConsumerApp />;
}
