"use client";

import React from "react";
import { GraduationCap } from "lucide-react";
import { BUP_FACULTIES, BUP_DEPARTMENTS_BY_FACULTY } from "@/constants/bup-departments";

export interface DepartmentSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  className?: string;
  showIcon?: boolean;
  allowOther?: boolean;
  isBengali?: boolean;
}

/**
 * Reusable BUP Department Selector Dropdown
 * Categorized by official faculties via <optgroup> labels
 * Used across Onboarding and Profile settings
 */
export function DepartmentSelector({
  value,
  onChange,
  disabled = false,
  error,
  placeholder,
  className = "",
  showIcon = true,
  allowOther = true,
  isBengali = false,
}: DepartmentSelectorProps) {
  const defaultPlaceholder = isBengali
    ? "বিভাগ / অনুষদ নির্বাচন করুন"
    : "Select Department / Faculty";

  return (
    <div className={`relative ${className}`}>
      {showIcon && (
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
          <GraduationCap className="w-4 h-4" />
        </div>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={isBengali ? "বিভাগ নির্বাচন" : "Select Department"}
        className={`w-full ${showIcon ? "pl-10" : "pl-3.5"} pr-4 py-2.5 rounded-xl bg-slate-950 border text-slate-100 text-sm font-sans transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
          error
            ? "border-rose-500/80 focus:ring-rose-500"
            : "border-slate-800 hover:border-slate-700"
        } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <option value="" disabled>
          {placeholder || defaultPlaceholder}
        </option>
        {BUP_FACULTIES.map((faculty) => (
          <optgroup
            key={faculty}
            label={faculty}
            className="bg-slate-900 font-semibold text-emerald-400"
          >
            {BUP_DEPARTMENTS_BY_FACULTY[faculty]?.map((dept) => (
              <option
                key={dept.code}
                value={dept.name}
                className="bg-slate-950 text-slate-100 font-normal pl-4"
              >
                {dept.name}
              </option>
            ))}
          </optgroup>
        ))}
        {allowOther && (
          <option value="Other" className="bg-slate-900 text-slate-100 font-medium">
            {isBengali ? "অন্যান্য (লিখুন)" : "Other (Specify)"}
          </option>
        )}
      </select>
    </div>
  );
}
