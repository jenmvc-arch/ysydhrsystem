import React, { useState, useRef, useEffect, useMemo } from 'react';
import { HandbookModule } from '../types';
import { HandwritingCanvas } from './HandwritingCanvas';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import {
  CheckCircle,
  Circle,
  Lock,
  Play,
  Video,
  PenTool,
  ArrowRight,
  RotateCcw,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Bot,
  BookOpen,
  Download,
  ShieldCheck,
  CheckSquare,
  Square,
  FileCheck,
  Award,
  FileText,
  ListFilter,
  Layers,
  Eye,
  ExternalLink,
  Search,
  X,
  Timer,
  Clock,
  BookmarkCheck,
  PlayCircle,
  Save,
  AlertCircle,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { exportAcknowledgementPdf } from '../utils/pdfExport';
import { OFFICIAL_HANDBOOK } from '../data/handbookDocument';
import { getHandbookVideoSection } from '../data/handbookVideos';
import { useFeedback } from '../../context/FeedbackContext';

interface HandbookViewProps {
  modules: HandbookModule[];
  onAcknowledgeModule: (moduleId: number, signature: string) => void;
  onOpenAiAssistant: () => void;
  partInitials: Record<number, string>;
  finalSignatureDataUrl: string | null;
  isSigningLocked?: boolean;
  onSavePartInitial: (moduleId: number, signature: string) => Promise<void>;
  onClearPartInitial: (moduleId: number) => Promise<void>;
  onSaveFinalSignature: (signature: string) => Promise<void>;
  onClearFinalSignature: () => Promise<void>;
  onDownloadFullHandbook: () => void;
  officialHandbookUrl?: string | null;
  officialHandbookVersion?: string;
  officialHandbookPageCount?: number;
  employeeName?: string;
  employeeId?: string;
  employeeDepartment?: string;
  employeePosition?: string;
  viewRole?: 'employee' | 'hr-admin';
  onShowNotification?: (title: string, message: string) => void;
}

type BriefingStatus = 'not_started' | 'in_progress' | 'saved_for_later' | 'completed';

interface SavedBriefingSession {
  briefingStatus: BriefingStatus;
  startedAt: number | null;
  deadlineAt: number | null;
  lastSavedAt: number | null;
  selectedModuleId: number;
  subsectionProgress?: Record<number, number>;
  selectedSubsectionByPart?: Record<number, number>;
  completedVideoSections?: Record<string, boolean>;
}

const BRIEFING_STORAGE_KEY = 'redpoint_handbook_briefing_v1';
const SECTION_TITLE_NUMBER_PREFIX = /^\d+\.\s*/;

const loadSavedBriefing = (): SavedBriefingSession | null => {
  try {
    const raw = localStorage.getItem(BRIEFING_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load handbook briefing session:', err);
    return null;
  }
};

const getPartSectionLabel = (partNumber: number, sectionNumber: number) =>
  `Part ${partNumber} - Section ${sectionNumber}`;

const getSectionVideoKey = (partNumber: number, sectionNumber: number) =>
  `${partNumber}:${sectionNumber}`;

const getPlainSectionTitle = (title?: string) =>
  title?.replace(SECTION_TITLE_NUMBER_PREFIX, '').trim() || '';

const getSectionCount = (module: HandbookModule) =>
  Math.max(1, module.content.subsections?.length || module.sectionsCount || 1);

const isPartComplete = (module: HandbookModule, partInitials: Record<number, string>) =>
  module.status === 'completed' || Boolean(partInitials[module.id]);

export const HandbookView: React.FC<HandbookViewProps> = ({
  modules,
  onAcknowledgeModule,
  onOpenAiAssistant,
  partInitials,
  finalSignatureDataUrl,
  isSigningLocked = false,
  onSavePartInitial,
  onClearPartInitial,
  onSaveFinalSignature,
  onClearFinalSignature,
  onDownloadFullHandbook,
  officialHandbookUrl = null,
  officialHandbookVersion,
  officialHandbookPageCount,
  employeeName = 'Sarah Lin',
  employeeId = 'EMP-ONBOARDING',
  employeeDepartment = 'Operations',
  employeePosition = 'Specialist',
  viewRole = 'employee',
  onShowNotification,
}) => {
  const { t } = useLanguage();
  const { showWarning, confirmAction } = useFeedback();
  const savedBriefing = useMemo(() => loadSavedBriefing(), []);

  const [briefingStatus, setBriefingStatus] = useState<BriefingStatus>(() => {
    if (Object.keys(partInitials).length > 0 || finalSignatureDataUrl) {
      return 'in_progress';
    }
    return savedBriefing?.briefingStatus || 'not_started';
  });

  const [startedAt, setStartedAt] = useState<number | null>(() => {
    return savedBriefing?.startedAt || null;
  });

  const [deadlineAt, setDeadlineAt] = useState<number | null>(() => {
    return savedBriefing?.deadlineAt || null;
  });

  const [lastSavedAt, setLastSavedAt] = useState<number | null>(() => {
    return savedBriefing?.lastSavedAt || null;
  });

  const [selectedModuleId, setSelectedModuleId] = useState<number>(() => {
    return savedBriefing?.selectedModuleId || 1;
  });
  const [subsectionProgress, setSubsectionProgress] = useState<Record<number, number>>(
    () => savedBriefing?.subsectionProgress || {}
  );
  const [selectedSubsectionByPart, setSelectedSubsectionByPart] = useState<Record<number, number>>(
    () => savedBriefing?.selectedSubsectionByPart || {}
  );
  const [completedVideoSections, setCompletedVideoSections] = useState<Record<string, boolean>>(
    () => savedBriefing?.completedVideoSections || {}
  );
  const [expandedPartIds, setExpandedPartIds] = useState<Record<number, boolean>>(() => ({
    [savedBriefing?.selectedModuleId || 1]: true,
  }));

  const [contentType, setContentType] = useState<'full' | 'summary'>('full');
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [timeRemainingText, setTimeRemainingText] = useState<string>('7 Days Remaining');
  const [isOverdue, setIsOverdue] = useState<boolean>(false);

  const hasSigned = Boolean(finalSignatureDataUrl);

  // Employee Particulars State
  const [empName, setEmpName] = useState<string>(employeeName);
  const [empDept, setEmpDept] = useState<string>(employeeDepartment);
  const [empPosition, setEmpPosition] = useState<string>(employeePosition);
  const [empDate, setEmpDate] = useState<string>(
    new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })
  );

  useEffect(() => {
    if (employeeName) setEmpName(employeeName);
    if (employeeDepartment) setEmpDept(employeeDepartment);
    if (employeePosition) setEmpPosition(employeePosition);
  }, [employeeName, employeeDepartment, employeePosition]);

  // Overall progress calculation
  const completedCount = modules.filter((m) => !!partInitials[m.id]).length;
  const overallPercent = Math.round((completedCount / modules.length) * 100);

  // 5-point Covenant Checklist
  const [covenants, setCovenants] = useState<boolean[]>([true, true, true, true, true]);
  const [isFinalSigned, setIsFinalSigned] = useState<boolean>(false);

  useEffect(() => {
    if (isSigningLocked) setIsFinalSigned(true);
  }, [isSigningLocked]);

  // If completed, update status
  useEffect(() => {
    if (overallPercent === 100 && hasSigned) {
      setBriefingStatus('completed');
    }
  }, [overallPercent, hasSigned]);

  // Auto-persist briefing session state
  useEffect(() => {
    try {
      const data: SavedBriefingSession = {
        briefingStatus,
        startedAt,
        deadlineAt,
        lastSavedAt,
        selectedModuleId,
        subsectionProgress,
        selectedSubsectionByPart,
        completedVideoSections,
      };
      localStorage.setItem(BRIEFING_STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('Failed to save briefing state:', err);
    }
  }, [
    briefingStatus,
    startedAt,
    deadlineAt,
    lastSavedAt,
    selectedModuleId,
    subsectionProgress,
    selectedSubsectionByPart,
    completedVideoSections,
  ]);

  // 7-day Countdown Timer Calculation
  useEffect(() => {
    if (!deadlineAt) {
      setTimeRemainingText('7-Day Period');
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const diff = deadlineAt - now;

      if (diff <= 0) {
        setIsOverdue(true);
        setTimeRemainingText('7-Day Window Expired');
        return;
      }

      setIsOverdue(false);
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeRemainingText(`${days}d ${hours}h left`);
      } else {
        setTimeRemainingText(`${hours}h ${mins}m left`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [deadlineAt]);

  const covenantTexts = [
    'I have received a copy of the RedPoint Sdn. Bhd. Employee Handbook (Version 1.0).',
    'I have read and understood the contents of this Handbook.',
    'I agree to comply with all Company policies, procedures, rules, and guidelines contained herein and any amendments made from time to time.',
    'I understand that this Handbook does not constitute a contract of employment and does not alter the terms and conditions of my Employment Contract.',
    'I understand that it is my responsibility to seek clarification from Human Resources if I have any questions regarding the contents of this Handbook.',
  ];

  const allCovenantsChecked = covenants.every(Boolean);

  const toggleCovenant = (index: number) => {
    setCovenants((prev) => {
      const updated = [...prev];
      updated[index] = !updated[index];
      return updated;
    });
  };

  // Content card ref and scroll progress tracking
  const handbookColumnRef = useRef<HTMLDivElement | null>(null);
  const contentCardRef = useRef<HTMLDivElement | null>(null);
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [isAtContentEnd, setIsAtContentEnd] = useState<boolean>(false);
  const [activeVideoSourceMode, setActiveVideoSourceMode] = useState<
    'section' | 'part' | 'unavailable'
  >('section');

  // Filter modules based on search query
  const filteredModules = modules.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const searchableText = [
      m.title,
      m.subtitle,
      m.content.sectionTitle,
      ...m.content.bodyParagraphs,
      m.content.keyTakeaway,
      ...(m.content.subsections || []).flatMap((subsection) => [
        subsection.title || '',
        ...subsection.paragraphs,
        ...(subsection.bulletPoints || []),
        ...(subsection.table?.headers || []),
        ...(subsection.table?.rows.flat() || []),
      ]),
    ].join(' ').toLowerCase();
    return searchableText.includes(q);
  });

  const activeModule = modules.find((m) => m.id === selectedModuleId) || modules[0] || {
    id: 1,
    title: 'Part 1 – Introduction & Red Point Corporate Identity',
    subtitle: 'Company background, culture, and organizational values',
    status: 'in-progress',
    sectionsCount: 4,
    completedSections: 0,
    content: {
      sectionTitle: 'Part 1: Introduction and Corporate Overview',
      bodyParagraphs: ['Welcome to the official Red Point Employee Handbook.'],
      keyTakeaway: 'Compliance and integrity are core to Red Point operations.',
    },
  };
  const activeSubsections = activeModule.content.subsections || [];
  const savedSubsectionIndex = subsectionProgress[activeModule.id] || 0;
  const defaultSubsectionIndex = partInitials[activeModule.id] || activeModule.status === 'completed'
    ? Math.max(0, activeSubsections.length - 1)
    : Math.min(savedSubsectionIndex, Math.max(0, activeSubsections.length - 1));
  const activeSubsectionIndex = activeSubsections.length > 0
    ? Math.min(
        selectedSubsectionByPart[activeModule.id] ?? defaultSubsectionIndex,
        partInitials[activeModule.id] || activeModule.status === 'completed'
          ? activeSubsections.length - 1
          : savedSubsectionIndex
      )
    : 0;
  const activeSubsection = activeSubsections[activeSubsectionIndex];
  const activeSectionNumber = activeSubsections.length > 0 ? activeSubsectionIndex + 1 : 1;
  const activeSectionLabel = getPartSectionLabel(activeModule.id, activeSectionNumber);
  const isOpeningSection = activeSubsectionIndex === 0;
  const pageHeading = isOpeningSection
    ? activeModule.content.sectionTitle
    : activeSubsection?.title?.trim() || activeModule.content.sectionTitle;
  const sectionVideoFallbackTitle = activeSubsection?.title
    ? `${activeSectionLabel} - ${
        getPlainSectionTitle(activeSubsection.title) || activeSubsection.title
      }`
    : `${activeSectionLabel} Briefing`;
  const sectionHandbookVideo = getHandbookVideoSection(
    activeModule.id,
    activeSectionNumber,
    sectionVideoFallbackTitle,
    activeModule.videoDuration
  );
  const partHandbookVideo = getHandbookVideoSection(
    activeModule.id,
    undefined,
    activeModule.content.sectionTitle,
    activeModule.videoDuration
  );
  const canFallbackToPartVideo =
    Boolean(partHandbookVideo.sourceUrl) &&
    partHandbookVideo.sourceUrl !== sectionHandbookVideo.sourceUrl;
  const resolvedVideoSourceMode =
    activeVideoSourceMode === 'section' &&
    !sectionHandbookVideo.sourceUrl &&
    canFallbackToPartVideo
      ? 'part'
      : activeVideoSourceMode;
  const handbookVideo =
    resolvedVideoSourceMode === 'part'
      ? {
          ...partHandbookVideo,
          sectionNumber: activeSectionNumber,
          title: sectionHandbookVideo.title,
          duration: sectionHandbookVideo.duration,
        }
      : resolvedVideoSourceMode === 'unavailable'
      ? {
          ...sectionHandbookVideo,
          sourceUrl: null,
          kind: 'file' as const,
        }
      : sectionHandbookVideo;
  const videoPosterUrl = activeModule.videoPosterUrl || handbookVideo.posterUrl;
  const videoDuration = handbookVideo.duration || activeModule.videoDuration;
  const activeVideoKey = getSectionVideoKey(activeModule.id, activeSectionNumber);
  const activePageRange = OFFICIAL_HANDBOOK.partPages[activeModule.id] || { start: 1, end: 5 };
  const officialPdfUrl = officialHandbookUrl && activePageRange
    ? `${officialHandbookUrl}#page=${activePageRange.start}&view=FitH&toolbar=1&navpanes=0`
    : null;
  const isActiveModuleReviewComplete =
    activeSubsections.length === 0 || activeSubsectionIndex >= activeSubsections.length - 1;
  const visibleModules = filteredModules.filter((module) => module.id === activeModule.id);

  const totalSectionCount = modules.reduce((total, module) => total + getSectionCount(module), 0);
  const completedSectionsAcrossHandbook = modules
    .filter((module) => isPartComplete(module, partInitials))
    .reduce((total, module) => total + getSectionCount(module), 0);
  const activePartSectionCount = getSectionCount(activeModule);
  const activePartComplete = isPartComplete(activeModule, partInitials);
  const furthestCompletedSection = Math.min(
    subsectionProgress[activeModule.id] || 0,
    activePartSectionCount
  );
  const isPreviouslyCompletedSection =
    activePartComplete || activeSubsectionIndex < furthestCompletedSection;
  const isTrackableSectionVideo = handbookVideo.kind === 'file' && Boolean(handbookVideo.sourceUrl);
  const isVideoComplete =
    isPreviouslyCompletedSection ||
    Boolean(completedVideoSections[activeVideoKey]) ||
    !isTrackableSectionVideo;
  const canContinueToNextSection =
    !isActiveModuleReviewComplete && isAtContentEnd && isVideoComplete;
  const isReadingCurrentSection =
    !activePartComplete &&
    activeSubsectionIndex === Math.min(furthestCompletedSection, activePartSectionCount - 1);
  const proratedActiveSection = isReadingCurrentSection ? scrollProgress / 100 : 0;
  const completedSectionsInCurrentPart = activePartComplete
    ? activePartSectionCount
    : furthestCompletedSection;
  const handbookReadingProgress = Math.min(
    100,
    Math.round(
      ((completedSectionsAcrossHandbook +
        (activePartComplete ? 0 : completedSectionsInCurrentPart) +
        proratedActiveSection) /
        totalSectionCount) *
        100
    )
  );

  useEffect(() => {
    setActiveVideoSourceMode('section');
  }, [activeVideoKey]);

  useEffect(() => {
    const scrollContainer = contentCardRef.current;

    const calculateScrollProgress = () => {
      if (!scrollContainer || !contentCardRef.current) return;

      const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      const atEnd = maxScrollTop <= 1 || scrollContainer.scrollTop >= maxScrollTop - 8;
      const percentage = maxScrollTop <= 1
        ? 100
        : Math.min(100, Math.max(0, Math.round((scrollContainer.scrollTop / maxScrollTop) * 100)));

      setScrollProgress(percentage);
      setIsAtContentEnd(atEnd);
    };

    setScrollProgress(0);
    setIsAtContentEnd(false);
    scrollContainer?.addEventListener('scroll', calculateScrollProgress, { passive: true });
    window.addEventListener('resize', calculateScrollProgress, { passive: true });

    const timeoutId = setTimeout(calculateScrollProgress, 120);

    return () => {
      clearTimeout(timeoutId);
      scrollContainer?.removeEventListener('scroll', calculateScrollProgress);
      window.removeEventListener('resize', calculateScrollProgress);
    };
  }, [activeSubsectionIndex, selectedModuleId, contentType]);

  const scrollModuleToTop = () => {
    contentCardRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    handbookColumnRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    setScrollProgress(0);
    setIsAtContentEnd(false);
  };

  const handleSelectModule = (id: number) => {
    const targetModule = modules.find((module) => module.id === id);
    const targetSectionCount = targetModule?.content.subsections?.length || 0;
    if (targetModule && targetSectionCount > 0) {
      const lastAvailableSection = targetModule.status === 'locked' && !partInitials[targetModule.id]
        ? -1
        : targetModule.status === 'completed' || partInitials[targetModule.id]
        ? targetSectionCount - 1
        : subsectionProgress[targetModule.id] || 0;
      setSelectedSubsectionByPart((current) => ({
        ...current,
        [id]: Math.min(current[id] ?? 0, lastAvailableSection),
      }));
    }
    setSelectedModuleId(id);
    setExpandedPartIds((current) => ({ ...current, [id]: true }));
    setContentType('full');
    scrollModuleToTop();
  };

  const handleSelectSubsection = (module: HandbookModule, subsectionIndex: number) => {
    const sectionCount = module.content.subsections?.length || 0;
    const lastAvailableSection = module.status === 'locked' && !partInitials[module.id]
      ? -1
      : module.status === 'completed' || partInitials[module.id]
      ? Math.max(0, sectionCount - 1)
      : subsectionProgress[module.id] || 0;

    if (subsectionIndex > lastAvailableSection) {
      showWarning(
        'Section Locked',
        module.status === 'locked' && !partInitials[module.id]
          ? `Part ${module.id} is locked. Please complete Part ${module.id - 1} first.`
          : `${getPartSectionLabel(module.id, subsectionIndex + 1)} is locked. Please complete ${
              getPartSectionLabel(module.id, lastAvailableSection + 1)
            } first.`
      );
      return;
    }

    if (briefingStatus === 'not_started') {
      handleStartBriefing();
    }

    setSelectedModuleId(module.id);
    setExpandedPartIds((current) => ({ ...current, [module.id]: true }));
    setSelectedSubsectionByPart((current) => ({
      ...current,
      [module.id]: subsectionIndex,
    }));
    setContentType('full');
    scrollModuleToTop();
  };

  const togglePartExpansion = (partId: number) => {
    setExpandedPartIds((current) => ({
      ...current,
      [partId]: !current[partId],
    }));
  };

  const markSectionVideoComplete = (videoKey: string) => {
    setCompletedVideoSections((current) => {
      if (current[videoKey]) return current;
      return {
        ...current,
        [videoKey]: true,
      };
    });
  };

  const handleSectionVideoEnded = () => {
    if (briefingStatus === 'not_started') {
      handleStartBriefing();
    }
    markSectionVideoComplete(activeVideoKey);
  };

  const handleSectionVideoError = () => {
    setActiveVideoSourceMode((current) => {
      if (current === 'section' && canFallbackToPartVideo) {
        return 'part';
      }
      return 'unavailable';
    });
  };

  const handleContinueSubsection = () => {
    if (isActiveModuleReviewComplete || !isAtContentEnd || !isVideoComplete) return;
    setSubsectionProgress((current) => ({
      ...current,
      [activeModule.id]: activeSubsectionIndex + 1,
    }));
    setSelectedSubsectionByPart((current) => ({
      ...current,
      [activeModule.id]: activeSubsectionIndex + 1,
    }));
    scrollModuleToTop();
  };

  // START BRIEFING SESSION HANDLER
  const handleStartBriefing = () => {
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const deadline = now + sevenDaysMs;

    setStartedAt(now);
    setDeadlineAt(deadline);
    setLastSavedAt(now);
    setBriefingStatus('in_progress');
    setSelectedModuleId(1);

    if (onShowNotification) {
      onShowNotification(
        'Briefing Session Started',
        'Your 7-day onboarding period is now active. You have 7 days to complete all 15 Parts and their sections.'
      );
    }
  };

  // SAVE FOR LATER HANDLER
  const handleSaveForLater = () => {
    const now = Date.now();
    setLastSavedAt(now);
    setBriefingStatus('saved_for_later');

    const dueFormatted = deadlineAt
      ? new Date(deadlineAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
      : '7 days from start';

    if (onShowNotification) {
      onShowNotification(
        'Progress Saved for Later',
        `Your onboarding progress (${activeSectionLabel}) has been safely saved. You can resume anytime before ${dueFormatted}.`
      );
    }
  };

  // CONTINUE SESSION HANDLER
  const handleContinueSession = () => {
    setBriefingStatus('in_progress');
    if (onShowNotification) {
      onShowNotification(
        'Briefing Resumed',
        `Welcome back! Continuing ${activeSectionLabel} of the Employee Handbook.`
      );
    }
  };

  // START OVER HANDLER
  const handleStartOver = async () => {
    await confirmAction({
      title: 'Start Briefing Over',
      message: 'Are you sure you want to start over? This will reset your briefing session back to Part 1.',
      tone: 'warning',
      confirmLabel: 'Start Over',
      onConfirm: () => {
        setSelectedModuleId(1);
        setSubsectionProgress({});
        setSelectedSubsectionByPart({});
        setCompletedVideoSections({});
        setExpandedPartIds({ 1: true });
        setBriefingStatus('in_progress');
        setLastSavedAt(Date.now());

        if (onShowNotification) {
          onShowNotification(
            'Briefing Session Reset',
            'Handbook briefing has been reset to Part 1.'
          );
        }
      },
    });
  };

  const handleAcknowledge = () => {
    if (!hasSigned || !finalSignatureDataUrl) return;
    setIsFinalSigned(true);
    onAcknowledgeModule(activeModule.id, finalSignatureDataUrl);
  };

  const handleDownloadPdfCertificate = () => {
    exportAcknowledgementPdf({
      employeeName: empName || 'Sarah Lin',
      department: empDept || 'Marketing',
      position: empPosition || 'Digital Content Specialist',
      signedDate: empDate || new Date().toLocaleDateString(),
      signatureTextOrImage: finalSignatureDataUrl || empName || 'Sarah Lin',
      covenants: covenantTexts,
    });
  };

  const handleDownloadFullHandbookPdf = () => {
    onDownloadFullHandbook();
  };

  return (
    <div className="w-full max-w-[1200px] mx-auto space-y-5 pb-12 text-left">
      {/* ========================================================================= */}
      {/* 7-DAY BRIEFING CONTROL BAR & STATUS HEADER */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl shadow-xs border border-[#F2E8D8] p-5 sm:p-6 transition-all">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <span className="bg-[#810912] text-white text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                7-Day Onboarding Cycle
              </span>
              {briefingStatus === 'not_started' && (
                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Not Started
                </span>
              )}
              {briefingStatus === 'in_progress' && (
                <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <PlayCircle className="w-3 h-3 text-emerald-700" />
                  In Progress ({activeSectionLabel})
                </span>
              )}
              {briefingStatus === 'saved_for_later' && (
                <span className="bg-blue-100 text-blue-800 border border-blue-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <BookmarkCheck className="w-3 h-3 text-blue-700" />
                  Saved for Later
                </span>
              )}
              {briefingStatus === 'completed' && (
                <span className="bg-emerald-600 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-white" />
                  All 15 Parts Completed
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-[#1b1c1c] tracking-tight">
              Employee Handbook & Policy Briefing
            </h2>
            <p className="text-xs sm:text-sm text-[#59413f] mt-1">
              Employees have a mandatory 7-day period to review all 15 Parts and their sections, acknowledge SOPs, and complete digital sign-off.
            </p>
          </div>

          {/* Right Action Cluster for 7-Day Session Management */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto shrink-0 justify-start lg:justify-end">
            {/* Countdown Badge if session has started */}
            {briefingStatus !== 'not_started' && deadlineAt && (
              <div
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border shrink-0 ${
                  isOverdue
                    ? 'bg-red-100 text-red-900 border-red-300'
                    : 'bg-[#FAF6EF] text-[#810912] border-[#e0bfbc]'
                }`}
                title={`Due by: ${new Date(deadlineAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}`}
              >
                <Timer className={`w-4 h-4 ${isOverdue ? 'text-red-700 animate-bounce' : 'text-[#810912]'}`} />
                <span>{timeRemainingText}</span>
              </div>
            )}

            {/* If Not Started: Show Big START button */}
            {briefingStatus === 'not_started' ? (
              <button
                type="button"
                onClick={handleStartBriefing}
                className="px-6 py-2.5 rounded-xl bg-[#810912] text-white font-extrabold text-xs hover:bg-[#a32626] transition-all shadow-md flex items-center gap-2 cursor-pointer hover:-translate-y-0.5"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>START BRIEFING SESSION</span>
              </button>
            ) : (
              /* If Session Active: Show Save for Later, Continue, and Start Over buttons */
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveForLater}
                  className="px-3.5 py-2 rounded-lg bg-[#FAF6EF] border border-[#e0bfbc] text-[#59413f] font-bold text-xs hover:bg-[#f2e8d8] transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Save your current progress and resume anytime within your 7-day window"
                >
                  <Save className="w-3.5 h-3.5 text-[#810912]" />
                  <span>Save for Later</span>
                </button>

                {briefingStatus === 'saved_for_later' && (
                  <button
                    type="button"
                    onClick={handleContinueSession}
                    className="px-4 py-2 rounded-lg bg-[#810912] text-white font-bold text-xs hover:bg-[#a32626] transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Continue Session</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleStartOver}
                  className="px-3.5 py-2 rounded-lg border border-gray-300 text-gray-600 font-bold text-xs hover:bg-gray-100 transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Restart handbook briefing from Part 1"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-gray-500" />
                  <span>Start Over</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Informative Guidance Banner if not started */}
        {briefingStatus === 'not_started' && (
          <div className="mt-4 p-4 rounded-xl bg-[#FAF6EF] border border-[#e0bfbc] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#810912] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-[#1b1c1c]">
                  Welcome to your Onboarding Briefing Session
                </p>
                <p className="text-[11px] text-[#59413f] mt-0.5">
                  Click the <strong>START</strong> button above to activate your 7-day orientation window. You can save your progress at any time and return before the deadline.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleStartBriefing}
              className="px-4 py-1.5 rounded-lg bg-[#810912] text-white text-xs font-bold shrink-0 hover:bg-[#a32626] transition-colors cursor-pointer"
            >
              Start Now →
            </button>
          </div>
        )}
      </div>

      {/* Sticky Module Reading Progress Bar */}
      <div className="sticky top-[-12px] z-50 self-start bg-white border border-[#F2E8D8] rounded-xl p-3 sm:p-4 shadow-[0_4px_12px_rgba(51,51,51,0.08)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 transition-all">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="bg-[#810912] text-white text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider shrink-0 shadow-xs flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            <span>{activeSectionLabel}</span>
          </span>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-extrabold text-[#1b1c1c] truncate">
              {activeModule.content.sectionTitle}
            </h2>
            <p className="text-[11px] text-[#59413f] truncate hidden md:block">
              {activeModule.title}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 bg-[#FAF6EF] sm:bg-transparent p-2 sm:p-0 rounded-lg border sm:border-0 border-[#F2E8D8]">
          <div className="text-right whitespace-nowrap">
            <span className="text-xs font-semibold text-[#59413f]">
              {t.readingProgress}:{' '}
              <strong className="text-[#810912] font-black">{handbookReadingProgress}%</strong>
            </span>
          </div>
          <div className="flex-1 sm:w-44 h-2.5 bg-[#e0bfbc]/30 rounded-full overflow-hidden border border-[#e0bfbc]/60 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-[#a32626] to-[#810912] transition-all duration-150 ease-out rounded-full"
              style={{ width: `${handbookReadingProgress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 relative">
        {/* Left Column: Handbook Modules Index Card */}
        <div className="lg:w-1/3 flex flex-col gap-4">
          <div className="bg-white rounded-xl shadow-[0_4px_6px_-1px_rgba(51,51,51,0.05),0_10px_15px_-3px_rgba(51,51,51,0.1)] border border-[#F2E8D8] p-6 flex-1">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-[#1b1c1c]">{t.handbookHeaderTitle}</h3>
              <button
                type="button"
                onClick={onOpenAiAssistant}
                className="p-1.5 rounded-lg bg-[#a32626]/10 text-[#810912] hover:bg-[#a32626]/20 transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
                title={t.askAiAboutModule}
              >
                <Bot className="w-4 h-4" />
                <span>{t.aiAssistant}</span>
              </button>
            </div>

            {/* Progress Header */}
            <div className="mb-5">
              <div className="flex justify-between items-end mb-2">
                <span className="text-xs font-semibold text-[#59413f]">{t.overallProgress}</span>
                <span className="text-xs font-bold text-[#810912]">{overallPercent}%</span>
              </div>
              <div className="w-full bg-[#f0eded] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[#a32626] h-full rounded-full transition-all duration-300"
                  style={{ width: `${overallPercent}%` }}
                ></div>
              </div>
            </div>

            {/* Local Search Input Filter */}
            <div className="mb-4">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-[#810912]/60 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search modules or keywords..."
                  className="w-full pl-9 pr-8 py-2 text-xs bg-[#FAF6EF] border border-[#e0bfbc] rounded-lg text-[#1b1c1c] placeholder:text-[#59413f]/60 focus:outline-hidden focus:border-[#810912] focus:ring-1 focus:ring-[#810912] transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 p-1 text-[#59413f] hover:text-[#810912] rounded-full cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {searchQuery.trim() && (
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#59413f] px-1">
                  <span>Found {filteredModules.length} {filteredModules.length === 1 ? 'Part' : 'Parts'}</span>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-[#810912] hover:underline font-semibold cursor-pointer"
                  >
                    Clear Filter
                  </button>
                </div>
              )}
            </div>

            {/* Parts and Sections Index */}
            {visibleModules.length === 0 ? (
              <div className="p-5 text-center bg-[#FAF6EF] rounded-lg border border-dashed border-[#e0bfbc] space-y-2">
                <Search className="w-6 h-6 text-[#810912]/40 mx-auto" />
                <p className="text-xs font-bold text-[#1b1c1c]">No modules found</p>
                <p className="text-[11px] text-[#59413f]">
                  No handbook Part or section matches &ldquo;{searchQuery}&rdquo;. Try another title or keyword.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-2 px-3 py-1 bg-[#810912] text-white text-xs font-semibold rounded-md hover:bg-[#a32626] transition-colors cursor-pointer"
                >
                  Reset Search
                </button>
              </div>
            ) : (
              <ul className="space-y-2.5 pr-1">
                {visibleModules.map((m) => {
                  const isSelected = m.id === selectedModuleId;
                  const isCompleted = m.status === 'completed' || !!partInitials[m.id];
                  const isLocked = m.status === 'locked' && !isCompleted;
                  const sections = m.content.subsections || [];
                  const isExpanded = expandedPartIds[m.id] || isSelected;
                  const availableSectionIndex = isLocked
                    ? -1
                    : isCompleted
                    ? Math.max(0, sections.length - 1)
                    : Math.min(subsectionProgress[m.id] || 0, Math.max(0, sections.length - 1));

                  return (
                    <li key={m.id} className="space-y-1">
                      <div
                        className={`flex items-center gap-2 rounded-lg border transition-all ${
                          isSelected
                            ? 'border-[#810912]/30 bg-[#810912]/10 text-[#810912]'
                            : isLocked
                            ? 'border-transparent opacity-60 text-gray-400'
                            : 'border-transparent hover:bg-[#f6f3f2] text-[#1b1c1c]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (briefingStatus === 'not_started') {
                              handleStartBriefing();
                            }
                            if (isLocked && m.id > 1) {
                              const prevUncompleted = modules.find(
                                (prev) => prev.id < m.id && prev.status !== 'completed' && !partInitials[prev.id]
                              );
                              showWarning(
                                'Part Locked',
                                `Part ${m.id} is locked. Please initial and complete Part ${
                                  prevUncompleted ? prevUncompleted.id : m.id - 1
                                } first.`
                              );
                              return;
                            }
                            handleSelectModule(m.id);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
                        >
                          {isCompleted ? (
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : isLocked ? (
                            <Lock className="w-4 h-4 text-[#810912]/50 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-[#810912] shrink-0" />
                          )}
                          <span className="min-w-0">
                            <span
                              className={`block text-xs font-black uppercase tracking-wide ${
                                isSelected ? 'text-[#810912]' : 'text-[#1b1c1c]'
                              }`}
                            >
                              Part {m.id}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] font-medium text-[#59413f]">
                              {m.title.replace(/^Part \d+\s*[–-]\s*/, '')}
                            </span>
                          </span>
                        </button>
                        {sections.length > 0 && (
                          <button
                            type="button"
                            onClick={() => togglePartExpansion(m.id)}
                            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} Part ${m.id} sections`}
                            className="mr-2 rounded-md p-1.5 text-[#810912] transition-colors hover:bg-white"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>

                      {isExpanded && sections.length > 0 && (
                        <ul className="ml-4 space-y-1 border-l border-[#e0bfbc] pl-3">
                          {sections.map((section, sectionIndex) => {
                            const isSectionSelected = isSelected && activeSubsectionIndex === sectionIndex;
                            const isSectionCompleted =
                              isCompleted || sectionIndex < availableSectionIndex;
                            const isSectionLocked = sectionIndex > availableSectionIndex;
                            return (
                              <li key={`${m.id}-${sectionIndex}`}>
                                <button
                                  type="button"
                                  onClick={() => handleSelectSubsection(m, sectionIndex)}
                                  className={`flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                                    isSectionSelected
                                      ? 'bg-[#810912] text-white shadow-sm'
                                      : isSectionLocked
                                      ? 'cursor-not-allowed text-[#59413f]/45 hover:bg-[#FAF6EF]'
                                      : 'text-[#59413f] hover:bg-[#FAF6EF]'
                                  }`}
                                >
                                  {isSectionCompleted ? (
                                    <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  ) : isSectionLocked ? (
                                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  ) : (
                                    <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  )}
                                  <span className="min-w-0">
                                    <span className="block text-[10px] font-black uppercase tracking-wide">
                                      {getPartSectionLabel(m.id, sectionIndex + 1)}
                                    </span>
                                    <span className={`mt-0.5 block text-[10px] leading-snug ${
                                      isSectionSelected ? 'text-white/80' : 'text-[#59413f]/75'
                                    }`}>
                                      {section.title || `Section ${sectionIndex + 1}`}
                                    </span>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Center/Main Column: Policy Content & Section Video */}
        <div
          ref={handbookColumnRef}
          className="lg:w-2/3 flex flex-col gap-6 lg:sticky lg:top-36 lg:h-[calc(100vh-13rem)] lg:max-h-[calc(100vh-13rem)] lg:overflow-hidden lg:pr-2"
        >
          {/* Reserved video slot: the video stays fixed without covering the handbook. */}
          <div className="shrink-0 self-stretch">
            {/* Each handbook Part has an independent video slot and source. */}
            <div className="relative w-full h-64 sm:h-72 rounded-xl border border-[#F2E8D8] bg-[#403f3a] shadow-[0_4px_12px_rgba(51,51,51,0.12)] overflow-hidden">
              {handbookVideo.sourceUrl ? (
                handbookVideo.kind === 'embed' ? (
                  <iframe
                    key={`${activeVideoKey}-${handbookVideo.sourceUrl}`}
                    src={handbookVideo.sourceUrl}
                    title={`${handbookVideo.title} video`}
                    className="h-full w-full bg-black"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : (
                  <video
                    key={`${activeVideoKey}-${handbookVideo.sourceUrl}`}
                    controls
                    preload="metadata"
                    poster={videoPosterUrl}
                    onEnded={handleSectionVideoEnded}
                    onError={handleSectionVideoError}
                    onPlay={() => {
                      if (briefingStatus === 'not_started') handleStartBriefing();
                    }}
                    className="h-full w-full bg-black object-cover"
                  >
                    <source src={handbookVideo.sourceUrl} type="video/mp4" />
                    Your browser does not support the handbook video.
                  </video>
                )
              ) : (
                <>
                  <img
                    src={videoPosterUrl}
                    alt={`${handbookVideo.title} video placeholder`}
                    className="h-full w-full object-cover opacity-70 mix-blend-overlay"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45 p-6 text-center text-white">
                    <div className="max-w-md">
                      <Video className="mx-auto h-9 w-9 text-[#ffbbb5]" />
                      <p className="mt-3 text-sm font-extrabold">{handbookVideo.title}</p>
                      <p className="mt-1 text-xs text-white/80">
                        Part {handbookVideo.partNumber} video · {videoDuration}
                      </p>
                      <p className="mt-3 text-[11px] text-white/70">
                        This section video is not configured yet. Add its video URL to the
                        handbook video settings to enable playback.
                      </p>
                    </div>
                  </div>
                </>
              )}
              <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/65 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">
                {activeSectionLabel} Video Briefing
              </div>
            </div>
          </div>

          {/* Only handbook content and signing cards scroll; the video remains pinned above. */}
          <div
            ref={contentCardRef}
            className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain pr-1"
          >
            {/* Handbook Content Card */}
            <div className="bg-white rounded-xl shadow-[0_4px_6px_-1px_rgba(51,51,51,0.05),0_10px_15px_-3px_rgba(51,51,51,0.1)] border border-[#F2E8D8] overflow-hidden flex flex-col">
              {/* Text Content */}
              <div className="p-6 sm:p-8 flex-1">
              {/* View Mode Switcher Header Bar */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 pb-4 border-b border-[#F2E8D8]">
                <div className="flex items-center gap-2">
                  <span className="bg-[#810912]/10 text-[#810912] px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider">
                    {activeSectionLabel}
                  </span>
                  <span className="text-xs text-[#59413f]">
                    {activeSubsections.length > 0
                      ? `${activeSubsectionIndex + 1}/${activeSubsections.length}`
                      : `${activeModule.completedSections}/${activeModule.sectionsCount}`}{' '}
                    {t.sectionsLabel}
                  </span>
                </div>

                {/* Segmented Mode Switcher: Full Detail vs Executive Summary */}
                <div className="inline-flex p-1 bg-[#FAF6EF] border border-[#e0bfbc] rounded-xl shadow-xs">
                  <button
                    type="button"
                    onClick={() => setContentType('full')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                      contentType === 'full'
                        ? 'bg-[#810912] text-white shadow-xs'
                        : 'text-[#59413f] hover:text-[#1b1c1c] hover:bg-white/60'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Full Detail</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setContentType('summary')}
                    disabled={!isActiveModuleReviewComplete}
                    title={
                      isActiveModuleReviewComplete
                        ? 'View executive summary'
                        : 'Complete each handbook section first'
                    }
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                      contentType === 'summary'
                        ? 'bg-[#810912] text-white shadow-xs'
                        : !isActiveModuleReviewComplete
                        ? 'cursor-not-allowed text-[#59413f]/40 opacity-60'
                        : 'text-[#59413f] hover:text-[#1b1c1c] hover:bg-white/60'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Executive Summary</span>
                  </button>
                </div>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold text-[#1b1c1c] mb-6">
                {pageHeading}
              </h1>
              <p className="-mt-4 mb-6 text-xs font-bold uppercase tracking-wider text-[#810912]">
                {activeSectionLabel}
              </p>

              {/* FULL DETAIL VIEW MODE */}
              {contentType === 'full' ? (
                <div className="space-y-4 text-base text-[#59413f] leading-relaxed">
                  {officialPdfUrl && (
                    <section className="space-y-3" aria-label="Official employee handbook PDF">
                      <div className="flex flex-col gap-2 border-b border-[#F2E8D8] pb-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-extrabold text-[#1b1c1c]">
                            Official Employee Handbook
                          </p>
                          <p className="text-xs text-[#59413f]">
                            {officialHandbookVersion || OFFICIAL_HANDBOOK.displayVersion} · Pages {activePageRange.start}-{activePageRange.end} of {officialHandbookPageCount || OFFICIAL_HANDBOOK.pageCount}
                          </p>
                        </div>
                        <a
                          href={officialPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#e0bfbc] bg-white px-3 text-xs font-bold text-[#810912] hover:bg-[#FAF6EF]"
                        >
                          <ExternalLink className="h-4 w-4" />
                          <span>Open in separate tab</span>
                        </a>
                      </div>

                      <div className="overflow-hidden rounded-xl border border-[#e0bfbc] bg-[#FAF6EF]">
                        <iframe
                          src={officialPdfUrl}
                          title={`Official Handbook Pages ${activePageRange.start}-${activePageRange.end}`}
                          className="h-[560px] w-full bg-white"
                        />
                      </div>
                    </section>
                  )}

                  {isOpeningSection &&
                    activeModule.content.bodyParagraphs?.map((paragraph, index) => (
                      <p key={index} className="text-sm sm:text-base leading-relaxed text-[#1b1c1c]">
                        {paragraph}
                      </p>
                    ))}

                  {/* One subsection is shown at a time so review remains sequential. */}
                  {activeSubsection && (
                    <div key={activeSubsectionIndex} className="pt-4 space-y-3 border-t border-[#F2E8D8]">
                      {activeSubsection.title && isOpeningSection && (
                        <h3 className="text-base sm:text-lg font-bold text-[#1b1c1c]">
                          {activeSubsection.title}
                        </h3>
                      )}
                      {activeSubsection.paragraphs?.map((p, pIdx) => (
                        <p key={pIdx} className="text-xs sm:text-sm text-[#59413f] leading-relaxed">
                          {p}
                        </p>
                      ))}

                      {activeSubsection.bulletPoints && activeSubsection.bulletPoints.length > 0 && (
                        <ul className="list-disc list-inside space-y-1.5 pl-2 text-xs sm:text-sm text-[#59413f]">
                          {activeSubsection.bulletPoints.map((point, bpIdx) => (
                            <li key={bpIdx} className="leading-relaxed">
                              {point}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Sub-tables if present */}
                      {activeSubsection.table && (
                        <div className="overflow-x-auto my-3">
                          <table className="w-full text-xs text-left border-collapse border border-[#e0bfbc] rounded-lg">
                            <thead className="bg-[#810912] text-white font-bold">
                              <tr>
                                {activeSubsection.table.headers.map((header, hIdx) => (
                                  <th key={hIdx} className="p-2.5 border border-[#810912]">
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e0bfbc]">
                              {activeSubsection.table.rows.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-[#FAF6EF]/50">
                                  {row.map((cell, cIdx) => (
                                    <td key={cIdx} className="p-2.5 border border-[#e0bfbc] text-[#1b1c1c]">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* EXECUTIVE SUMMARY VIEW MODE */
                <div className="space-y-4 text-xs sm:text-sm text-[#59413f]">
                  <div className="p-4 bg-[#FAF6EF] rounded-xl border border-[#e0bfbc]">
                    <h4 className="font-bold text-[#810912] mb-2 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                      Executive Summary & Key Takeaway
                    </h4>
                    <p className="text-xs sm:text-sm text-[#1b1c1c] leading-relaxed">
                      {activeModule.content.keyTakeaway ||
                        'Employees are expected to adhere strictly to all Red Point operational standards and code of conduct policies.'}
                    </p>
                  </div>
                </div>
              )}

                {activeSubsections.length > 0 && (
                  <div className="mt-6 flex flex-col gap-3 border-t border-[#F2E8D8] pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-[#59413f]">
                        {activeSectionLabel} of {activeSubsections.length}
                        {isActiveModuleReviewComplete
                          ? ' reviewed. You may now complete this Part.'
                          : ' must be completed before the next section is shown.'}
                      </p>
                      {!isActiveModuleReviewComplete && (
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                              isVideoComplete
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-[#e0bfbc] bg-[#FAF6EF] text-[#59413f]'
                            }`}
                          >
                            {isVideoComplete ? (
                              <CheckSquare className="h-3.5 w-3.5" />
                            ) : (
                              <Square className="h-3.5 w-3.5" />
                            )}
                            <span>
                              {isTrackableSectionVideo
                                ? 'Watch the section video to the end'
                                : handbookVideo.sourceUrl
                                ? 'Section video is displayed'
                                : 'Section video is not configured'}
                            </span>
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                              isAtContentEnd
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-[#e0bfbc] bg-[#FAF6EF] text-[#59413f]'
                            }`}
                          >
                            {isAtContentEnd ? (
                              <CheckSquare className="h-3.5 w-3.5" />
                            ) : (
                              <Square className="h-3.5 w-3.5" />
                            )}
                            <span>Scroll to the end of this section</span>
                          </span>
                          {resolvedVideoSourceMode === 'part' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
                              <AlertCircle className="h-3.5 w-3.5" />
                              <span>Using the Part-level fallback video for this section</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {canContinueToNextSection && (
                      <button
                        type="button"
                        onClick={handleContinueSubsection}
                        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#810912] px-5 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-[#a32626]"
                      >
                        <span>
                          Continue to {getPartSectionLabel(activeModule.id, activeSubsectionIndex + 2)}
                        </span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

          {/* ========================================================================= */}
          {/* SIGNATURE / INITIAL CARD PER PART */}
          {/* ========================================================================= */}
          {!isActiveModuleReviewComplete ? null : activeModule.id === 15 ? (
            /* FINAL COVENANTS & COMPREHENSIVE SIGN-OFF CARD FOR PART 15 */
            <div className="bg-white rounded-xl shadow-md border-2 border-[#810912] p-6 sm:p-8 space-y-6">
              <div className="border-b border-[#F2E8D8] pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Award className="w-6 h-6 text-[#810912]" />
                  <h3 className="text-lg sm:text-xl font-extrabold text-[#1b1c1c]">
                    Part 15: Final Acknowledgement & Digital Sign-off
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-[#59413f]">
                  Please review the 5-point covenant and draw your full digital signature below to finalize your onboarding.
                </p>
              </div>

              {/* 5 Covenants */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-[#1b1c1c] uppercase tracking-wider">
                  Employee Covenants
                </h4>
                {covenantTexts.map((text, idx) => (
                  <label
                    key={idx}
                    className="flex items-start gap-3 p-3 rounded-lg border border-[#e0bfbc] hover:bg-[#FAF6EF] cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={covenants[idx]}
                      onChange={() => toggleCovenant(idx)}
                      className="mt-0.5 w-4 h-4 accent-[#810912]"
                    />
                    <span className="text-xs text-[#1b1c1c] leading-relaxed">{text}</span>
                  </label>
                ))}
              </div>

              {/* Signature Box */}
              <div className="bg-[#FAF6EF] p-4 rounded-xl border border-[#e0bfbc]">
                <HandwritingCanvas
                  key="final-signature"
                  label="Employee Formal Signature Pad"
                  subLabel="Draw your full formal signature to legally acknowledge the Red Point Employee Handbook."
                  height={140}
                  existingDataUrl={finalSignatureDataUrl}
                  disabled={isSigningLocked}
                  signerName={employeeName}
                  onSaveSignature={(dataUrl) => {
                    if (dataUrl) {
                      if (briefingStatus === 'not_started') {
                        handleStartBriefing();
                      }
                      void onSaveFinalSignature(dataUrl).then(() => {
                        setIsFinalSigned(true);
                      }).catch(() => undefined);
                    } else {
                      void onClearFinalSignature().then(() => {
                        setIsFinalSigned(false);
                      }).catch(() => undefined);
                    }
                  }}
                  onClear={() => {
                    setIsFinalSigned(false);
                  }}
                />
              </div>

              {/* Action Buttons & Verification Badge */}
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-2">
                <div className="flex items-center gap-2 text-xs text-[#59413f]">
                  <Sparkles className="w-4 h-4 text-[#810912] shrink-0" />
                  <span>RedPoint HR Compliance Audit Logged</span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(true)}
                    className="py-2.5 px-4 rounded-lg font-bold text-xs transition-all flex items-center gap-2 cursor-pointer bg-[#FAF6EF] border border-[#e0bfbc] text-[#810912] hover:bg-[#f2e8d8] shadow-xs hover:-translate-y-0.5"
                  >
                    <Eye className="w-4 h-4 text-[#810912]" />
                    <span>Preview Document</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadPdfCertificate}
                    disabled={!isFinalSigned && !hasSigned}
                    className={`py-2.5 px-3.5 rounded-lg font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
                      isFinalSigned || hasSigned
                        ? 'bg-[#FAF6EF] border border-[#e0bfbc] text-[#1b1c1c] hover:bg-[#f2e8d8]'
                        : 'bg-[#f6f3f2] text-[#59413f] cursor-not-allowed opacity-60 border border-[#e0bfbc]'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5 text-[#810912]" />
                    <span>Acknowledgement Certificate (PDF)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadFullHandbookPdf}
                    disabled={!isFinalSigned && !hasSigned}
                    className={`py-2.5 px-4 rounded-lg font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
                      isFinalSigned || hasSigned
                        ? 'bg-[#810912] text-white hover:bg-[#a32626] shadow-sm hover:-translate-y-0.5'
                        : 'bg-[#f6f3f2] text-[#59413f] cursor-not-allowed opacity-60 border border-[#e0bfbc]'
                    }`}
                  >
                    <Download className="w-4 h-4 text-[#D4AF37]" />
                    <span>Download Full Handbook + Quiz Record (PDF)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAcknowledge}
                    disabled={!hasSigned || !allCovenantsChecked}
                    className={`py-2.5 px-5 rounded-lg font-extrabold text-xs tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer ${
                      hasSigned && allCovenantsChecked
                        ? 'bg-[#1b1c1c] text-white hover:bg-black shadow-md hover:-translate-y-0.5'
                        : 'bg-[#f6f3f2] text-[#59413f] cursor-not-allowed opacity-60 border border-[#e0bfbc]'
                    }`}
                  >
                    <span>{isFinalSigned ? 'Re-confirm Sign-off' : 'Sign & Acknowledge'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* INITIAL SIGNATURE & SECTION ACKNOWLEDGEMENT CARD FOR PARTS 1 - 14 */
            <div className="bg-white rounded-xl shadow-md border-2 border-[#810912]/20 p-6 flex flex-col gap-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#810912]"></div>

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-[#F2E8D8]">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#810912] text-white rounded-lg shadow-xs">
                    <PenTool className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-extrabold text-[#1b1c1c] uppercase tracking-wide">
                      Part {activeModule.id} Employee Handwritten Initial
                    </h4>
                    <p className="text-xs text-[#59413f]">
                      Draw your handwritten initial on the signature pad below to unlock Part {activeModule.id + 1}
                    </p>
                  </div>
                </div>

                {partInitials[activeModule.id] || activeModule.status === 'completed' ? (
                  <div className="flex items-center gap-1.5 bg-[#E6F4EA] border border-[#34A853]/40 text-[#137333] px-3 py-1 rounded-full text-xs font-bold animate-fade-in">
                    <FileCheck className="w-4 h-4" />
                    <span>Handwritten Initial Recorded</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 bg-[#FFF0F0] border border-[#a32626]/30 text-[#810912] px-3 py-1 rounded-full text-xs font-bold">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Handwritten Initial Required</span>
                  </div>
                )}
              </div>

              <div className="bg-[#FAF6EF] p-4 rounded-xl border border-[#e0bfbc]">
                <HandwritingCanvas
                  key={activeModule.id}
                  label={`Employee Handwritten Initial Pad (Part ${activeModule.id})`}
                  subLabel={`Please draw your handwritten initial below to confirm you have thoroughly reviewed Part ${activeModule.id} – ${activeModule.content.sectionTitle}.`}
                  height={110}
                  existingDataUrl={partInitials[activeModule.id] || null}
                  disabled={isSigningLocked}
                  signerName={employeeName}
                  onSaveSignature={(dataUrl) => {
                    if (dataUrl) {
                      if (briefingStatus === 'not_started') {
                        handleStartBriefing();
                      }
                      void onSavePartInitial(activeModule.id, dataUrl).then(() => {
                        onAcknowledgeModule(activeModule.id, dataUrl);
                        if (onShowNotification) {
                          onShowNotification(
                            `Part ${activeModule.id} Initial Saved`,
                            `Your initial for Part ${activeModule.id} has been recorded.`
                          );
                        }
                      }).catch(() => undefined);
                    } else {
                      void onClearPartInitial(activeModule.id).catch(() => undefined);
                    }
                  }}
                />
              </div>

              {/* Section Navigation & Proceed Button */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
                <div className="text-xs text-[#59413f]">
                  {partInitials[activeModule.id] || activeModule.status === 'completed' ? (
                    <span className="text-[#137333] font-bold flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      Part {activeModule.id} initialed and verified. You may proceed to the next Part.
                    </span>
                  ) : (
                    <span className="text-[#810912] font-semibold flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-[#810912]" />
                      Handwrite your initial on the signature pad above to enable proceeding.
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!partInitials[activeModule.id] && activeModule.status !== 'completed') {
                      showWarning(
                        'Signature Required',
                        `Please draw your handwritten initial signature on the pad for Part ${activeModule.id} before proceeding.`
                      );
                      return;
                    }

                    if (activeModule.id < 15) {
                      handleSelectModule(activeModule.id + 1);
                    }
                  }}
                  disabled={!partInitials[activeModule.id] && activeModule.status !== 'completed'}
                  className={`py-2.5 px-5 rounded-lg font-bold text-xs transition-all shadow-xs flex items-center gap-2 shrink-0 ${
                    partInitials[activeModule.id] || activeModule.status === 'completed'
                      ? 'bg-[#1b1c1c] hover:bg-black text-white cursor-pointer shadow-md hover:-translate-y-0.5'
                      : 'bg-[#f6f3f2] text-[#59413f] cursor-not-allowed opacity-60 border border-[#e0bfbc]'
                  }`}
                >
                  <span>
                    {activeModule.id === 14
                      ? 'Proceed to Part 15 — Final Provisions & Signature'
                      : `Next: Part ${activeModule.id + 1} — ${modules.find(m => m.id === activeModule.id + 1)?.title.replace(/^Part \d+ – /, '') || 'Next Section'}`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Preview Document Modal */}
        <DocumentPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          empName={empName}
          empDept={empDept}
          empPosition={empPosition}
          empDate={empDate}
          finalSignatureDataUrl={finalSignatureDataUrl}
          partInitials={partInitials}
          covenants={covenants}
          covenantTexts={covenantTexts}
          modules={modules}
          quizScorePercent={90}
          quizGrade="Grade S (PASSED)"
          onDownloadPdf={handleDownloadFullHandbookPdf}
        />
      </div>
    </div>
  );
};
