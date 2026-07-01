/**
 * Prisma seed for SmartClinic
 * Run with:  npm run db:seed
 *
 * Seeds: 1 superadmin, sample doctors, sample bookings, offers, holidays
 */
import { PrismaClient, UserRole, UserStatus, BookingStatus, BookingSource, HolidayType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding SmartClinic database...\n');

  // ─── Superadmin ─────────────────────────────────────────────────────────────
  const adminEmail = 'admin@smartclinic.sa';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  const superadmin = existingAdmin ?? await prisma.user.create({
    data: {
      name: 'Super Admin',
      email: adminEmail,
      password: await bcrypt.hash('Admin@12345', 12),
      role: UserRole.superadmin,
      status: UserStatus.approved,
    },
  });
  console.log(`✅ Superadmin: ${superadmin.email}`);

  // ─── Doctors ────────────────────────────────────────────────────────────────
  const doctorsData = [
    {
      nameEn: 'Dr. Ahmed Al-Mansouri',
      nameAr: 'د. أحمد المنصوري',
      specialtyEn: 'General Medicine',
      specialtyAr: 'طب عام',
      phone: '+966501234567',
      email: 'ahmed@smartclinic.sa',
      calendarId: 'primary',
      workingStart: '09:00',
      workingEnd: '17:00',
      workingDays: [0, 1, 2, 3, 4],
      slotDuration: 30,
      breakEnabled: true,
      breakStart: '13:00',
      breakEnd: '14:00',
    },
    {
      nameEn: 'Dr. Sarah Al-Zahrani',
      nameAr: 'د. سارة الزهراني',
      specialtyEn: 'Pediatrics',
      specialtyAr: 'طب أطفال',
      phone: '+966502345678',
      email: 'sarah@smartclinic.sa',
      calendarId: 'primary',
      workingStart: '08:00',
      workingEnd: '16:00',
      workingDays: [1, 2, 3, 4, 6],
      slotDuration: 20,
      breakEnabled: false,
    },
    {
      nameEn: 'Dr. Khalid Al-Otaibi',
      nameAr: 'د. خالد العتيبي',
      specialtyEn: 'Cardiology',
      specialtyAr: 'أمراض القلب',
      phone: '+966503456789',
      email: 'khalid@smartclinic.sa',
      calendarId: 'primary',
      workingStart: '10:00',
      workingEnd: '18:00',
      workingDays: [0, 1, 2, 3, 4],
      slotDuration: 45,
      breakEnabled: true,
      breakStart: '14:00',
      breakEnd: '15:00',
    },
  ];

  const doctors: Awaited<ReturnType<typeof prisma.doctor.create>>[] = [];
  for (const d of doctorsData) {
    const existing = await prisma.doctor.findFirst({ where: { email: d.email } });
    const doc = existing
      ? await prisma.doctor.update({ where: { id: existing.id }, data: d })
      : await prisma.doctor.create({ data: d });
    doctors.push(doc);
    console.log(`✅ Doctor: ${d.nameEn}`);
  }

  // ─── Sample Bookings ─────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const bookings = [
    {
      name: 'Mohammed Al-Rashidi',
      phone: '+966551234567',
      service: 'General Consultation',
      date: today,
      time: '09:00',
      status: BookingStatus.confirmed,
      doctorId: doctors[0]?.id,
      source: BookingSource.dashboard,
    },
    {
      name: 'Fatima Al-Ghamdi',
      phone: '+966552345678',
      service: 'Follow-up',
      date: today,
      time: '10:00',
      status: BookingStatus.pending,
      doctorId: doctors[0]?.id,
      source: BookingSource.whatsapp,
    },
    {
      name: 'Abdullah Al-Shehri',
      phone: '+966553456789',
      service: 'Specialist Visit',
      date: tomorrow,
      time: '10:00',
      status: BookingStatus.pending,
      doctorId: doctors[1]?.id,
      source: BookingSource.dashboard,
    },
    {
      name: 'Nora Al-Qahtani',
      phone: '+966554567890',
      service: 'Lab Results Review',
      date: tomorrow,
      time: '14:00',
      status: BookingStatus.confirmed,
      doctorId: doctors[2]?.id,
      source: BookingSource.dashboard,
    },
  ];

  for (const b of bookings) {
    if (!b.doctorId) continue;
    try {
      await prisma.booking.create({ data: b });
      console.log(`✅ Booking: ${b.name} @ ${b.date} ${b.time}`);
    } catch {
      console.log(`⚠️  Booking already exists for ${b.name} @ ${b.date} ${b.time}, skipping`);
    }
  }

  // ─── Sample Offers ───────────────────────────────────────────────────────────
  const offersExist = await prisma.offer.count();
  if (offersExist === 0) {
    await prisma.offer.createMany({
      data: [
        {
          titleEn: 'New Patient Discount',
          titleAr: 'خصم المريض الجديد',
          descriptionEn: '20% off your first consultation',
          descriptionAr: 'خصم 20% على أول استشارة',
          code: 'NEW20',
          isActive: true,
          createdById: superadmin.id,
        },
        {
          titleEn: 'Family Package',
          titleAr: 'باقة العائلة',
          descriptionEn: 'Book 4 appointments and get 1 free',
          descriptionAr: 'احجز 4 مواعيد واحصل على موعد مجاني',
          code: 'FAM4PLUS1',
          isActive: true,
          expiresAt: new Date(Date.now() + 30 * 86400000),
          createdById: superadmin.id,
        },
      ],
    });
    console.log('✅ Offers created');
  }

  // ─── Weekly Holiday (Friday = 5) ─────────────────────────────────────────────
  const fridayHoliday = await prisma.holiday.findFirst({ where: { type: HolidayType.weekly, dayOfWeek: 5 } });
  if (!fridayHoliday) {
    await prisma.holiday.create({
      data: {
        type: HolidayType.weekly,
        dayOfWeek: 5,
        nameEn: 'Friday',
        nameAr: 'الجمعة',
        applyToAll: true,
        createdById: superadmin.id,
      },
    });
    console.log('✅ Friday weekly holiday created');
  }

  console.log('\n🎉 Seed complete!');
  console.log('─────────────────────────────────────');
  console.log('Login credentials:');
  console.log(`  Email:    ${adminEmail}`);
  console.log('  Password: Admin@12345');
  console.log('─────────────────────────────────────');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
