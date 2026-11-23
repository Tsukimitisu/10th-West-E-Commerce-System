import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import BrandLogo from "../ui/BrandLogo";
const AuthHeader = () => (
  <header className="customer-auth-header">
    <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
      <BrandLogo compact dark />
      <Link
        to="/shop"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-white hover:text-orange-300"
      >
        <ArrowLeft size={17} aria-hidden="true" />
        Back to Store
      </Link>
    </div>
  </header>
);
export default AuthHeader;
