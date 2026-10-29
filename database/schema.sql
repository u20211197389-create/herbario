--
-- PostgreSQL database dump
--

-- Dumped from database version 15.4
-- Dumped by pg_dump version 15.4

-- Started on 2024-12-12 15:25:51

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 867 (class 1247 OID 17976)
-- Name: use_doc_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.use_doc_type AS ENUM (
    'Cédula de Ciudadanía',
    'Cédula de Extranjería',
    'Pasaporte'
);


ALTER TYPE public.use_doc_type OWNER TO postgres;

--
-- TOC entry 864 (class 1247 OID 17965)
-- Name: use_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.use_role AS ENUM (
    'Director',
    'Curador',
    'Pasante',
    'Monitor',
    'Auxiliar'
);


ALTER TYPE public.use_role OWNER TO postgres;

--
-- TOC entry 241 (class 1255 OID 17983)
-- Name: check_user_role_func(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_user_role_func() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN
    IF NEW.use_role = 'Director' THEN
        IF EXISTS (SELECT 1 FROM users WHERE use_role = 'Director') THEN
            RAISE EXCEPTION 'Ya existe un usuario con el rol "admin"';
        END IF;
    END IF;
    RETURN NEW;
END;$$;


ALTER FUNCTION public.check_user_role_func() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 224 (class 1259 OID 18038)
-- Name: allies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.allies (
    all_id integer NOT NULL,
    all_name character varying(50) NOT NULL,
    all_summary text NOT NULL,
    all_logo text NOT NULL,
    all_link text NOT NULL,
    all_type character varying(8) NOT NULL,
    all_position integer NOT NULL
);


ALTER TABLE public.allies OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 18037)
-- Name: allies_all_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.allies_all_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.allies_all_id_seq OWNER TO postgres;

--
-- TOC entry 3446 (class 0 OID 0)
-- Dependencies: 223
-- Name: allies_all_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.allies_all_id_seq OWNED BY public.allies.all_id;


--
-- TOC entry 226 (class 1259 OID 18047)
-- Name: bibliographies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bibliographies (
    bib_id integer NOT NULL,
    bib_name character varying(255) NOT NULL,
    bib_author character varying(128) NOT NULL,
    bib_year integer NOT NULL,
    bib_tome_vol character varying(50),
    bib_editorial character varying(255),
    bib_area character varying(50) NOT NULL,
    bib_num_copies integer NOT NULL,
    bib_content text NOT NULL,
    bib_link text
);


ALTER TABLE public.bibliographies OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 18113)
-- Name: bibliographies_audit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bibliographies_audit (
    bib_audit_id integer NOT NULL,
    bib_id integer,
    operation_type character(1),
    operation_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    performed_by integer,
    bib_name character varying(255),
    bib_author character varying(128),
    bib_year integer,
    bib_tome_vol character varying(50),
    bib_editorial character varying(255),
    bib_area character varying(50),
    bib_num_copies integer,
    bib_content text,
    bib_link text
);


ALTER TABLE public.bibliographies_audit OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 18112)
-- Name: bibliographies_audit_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bibliographies_audit_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.bibliographies_audit_audit_id_seq OWNER TO postgres;

--
-- TOC entry 3447 (class 0 OID 0)
-- Dependencies: 232
-- Name: bibliographies_audit_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bibliographies_audit_audit_id_seq OWNED BY public.bibliographies_audit.bib_audit_id;


--
-- TOC entry 225 (class 1259 OID 18046)
-- Name: bibliographies_bib_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bibliographies_bib_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.bibliographies_bib_id_seq OWNER TO postgres;

--
-- TOC entry 3448 (class 0 OID 0)
-- Dependencies: 225
-- Name: bibliographies_bib_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bibliographies_bib_id_seq OWNED BY public.bibliographies.bib_id;


--
-- TOC entry 222 (class 1259 OID 18029)
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    eve_id integer NOT NULL,
    eve_name character varying(50) NOT NULL,
    eve_information character varying(255) NOT NULL,
    eve_poster text NOT NULL,
    eve_image text NOT NULL,
    eve_document text NOT NULL,
    eve_date character varying(8) NOT NULL,
    eve_participants character varying(255),
    eve_summary text,
    eve_position integer NOT NULL
);


ALTER TABLE public.events OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 18028)
-- Name: events_eve_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.events_eve_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.events_eve_id_seq OWNER TO postgres;

--
-- TOC entry 3449 (class 0 OID 0)
-- Dependencies: 221
-- Name: events_eve_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.events_eve_id_seq OWNED BY public.events.eve_id;


--
-- TOC entry 237 (class 1259 OID 18166)
-- Name: images; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.images (
    img_id integer NOT NULL,
    img_name character varying(128) NOT NULL,
    img_fk_record integer NOT NULL,
    img_fk_letter integer NOT NULL,
    img_path text NOT NULL
);


ALTER TABLE public.images OWNER TO postgres;

--
-- TOC entry 236 (class 1259 OID 18165)
-- Name: images_img_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.images_img_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.images_img_id_seq OWNER TO postgres;

--
-- TOC entry 3450 (class 0 OID 0)
-- Dependencies: 236
-- Name: images_img_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.images_img_id_seq OWNED BY public.images.img_id;


--
-- TOC entry 228 (class 1259 OID 18056)
-- Name: lends; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lends (
    len_id integer NOT NULL,
    len_name character varying(255) NOT NULL,
    len_doc_number integer NOT NULL,
    len_mobile integer NOT NULL,
    len_email character varying(50) NOT NULL,
    len_institution character varying(50),
    len_date date NOT NULL,
    len_return_date date NOT NULL,
    len_real_return_date date,
    len_returned boolean NOT NULL,
    len_comment character varying(50),
    len_fk_registered_user integer NOT NULL,
    len_fk_returned_user integer
);


ALTER TABLE public.lends OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 18095)
-- Name: lends_audit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lends_audit (
    len_audit_id integer NOT NULL,
    len_id integer,
    operation_type character(1),
    operation_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    performed_by integer,
    len_name character varying(255),
    len_doc_number integer,
    len_mobile integer,
    len_email character varying(50),
    len_institution character varying(50),
    len_date date,
    len_return_date date,
    len_real_return_date date,
    len_returned boolean,
    len_comment character varying(50),
    len_fk_registered_user integer,
    len_fk_returned_user integer
);


ALTER TABLE public.lends_audit OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 18094)
-- Name: lends_audit_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lends_audit_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.lends_audit_audit_id_seq OWNER TO postgres;

--
-- TOC entry 3451 (class 0 OID 0)
-- Dependencies: 230
-- Name: lends_audit_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lends_audit_audit_id_seq OWNED BY public.lends_audit.len_audit_id;


--
-- TOC entry 229 (class 1259 OID 18072)
-- Name: lends_bibliographies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lends_bibliographies (
    lend_id integer NOT NULL,
    bib_id integer NOT NULL,
    amount integer NOT NULL
);


ALTER TABLE public.lends_bibliographies OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 18055)
-- Name: lends_len_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lends_len_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.lends_len_id_seq OWNER TO postgres;

--
-- TOC entry 3452 (class 0 OID 0)
-- Dependencies: 227
-- Name: lends_len_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lends_len_id_seq OWNED BY public.lends.len_id;


--
-- TOC entry 235 (class 1259 OID 18157)
-- Name: letters; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.letters (
    let_id integer NOT NULL,
    let_name character varying(128) NOT NULL,
    let_document text NOT NULL
);


ALTER TABLE public.letters OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 18156)
-- Name: letters_let_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.letters_let_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.letters_let_id_seq OWNER TO postgres;

--
-- TOC entry 3453 (class 0 OID 0)
-- Dependencies: 234
-- Name: letters_let_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.letters_let_id_seq OWNED BY public.letters.let_id;


--
-- TOC entry 220 (class 1259 OID 18020)
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.projects (
    pro_id integer NOT NULL,
    pro_title character varying(255) NOT NULL,
    pro_year integer NOT NULL,
    pro_researchers character varying(255) NOT NULL,
    pro_description text NOT NULL,
    pro_presentation text NOT NULL,
    pro_publication text,
    pro_position integer NOT NULL
);


ALTER TABLE public.projects OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 18019)
-- Name: projects_pro_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.projects_pro_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.projects_pro_id_seq OWNER TO postgres;

--
-- TOC entry 3454 (class 0 OID 0)
-- Dependencies: 219
-- Name: projects_pro_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.projects_pro_id_seq OWNED BY public.projects.pro_id;


--
-- TOC entry 240 (class 1259 OID 18203)
-- Name: records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.records (
    rec_catalog_number integer NOT NULL,
    rec_institution_code character varying(15) NOT NULL,
    rec_institution_id character varying(16) NOT NULL,
    rec_collection_code character varying(5) NOT NULL,
    rec_collection_id integer NOT NULL,
    rec_modified_date date,
    rec_modified character varying(128),
    rec_license character varying(128),
    rec_rights_holder character varying(50) NOT NULL,
    rec_access_rights character varying(50) NOT NULL,
    rec_record_number character varying(16) NOT NULL,
    rec_recorded_by character varying(128) NOT NULL,
    rec_previousidentifications character varying(50),
    rec_reproductive_condition character varying(128),
    rec_establishment_means character varying(128),
    rec_preparations character varying(50) NOT NULL,
    rec_associated_sequences text,
    rec_occurrence_remarks character varying(128),
    rec_material_sample_id character varying(16),
    rec_sampling_protocol character varying(50),
    rec_event_date date,
    rec_habitat character varying(50),
    rec_continent character varying(30) NOT NULL,
    rec_country character varying(30) NOT NULL,
    rec_state_province character varying(30) NOT NULL,
    rec_county character varying(30) NOT NULL,
    rec_locality character varying(128),
    rec_minimum_elevation_meters integer,
    rec_verbatim_latitude character varying(30),
    rec_verbatim_longitude character varying(30),
    rec_verbatim_coordinate_system character varying(30),
    rec_decimal_latitude double precision,
    rec_decimal_longitude double precision,
    rec_geodetic_datum character varying(30),
    rec_identified_by character varying(128),
    rec_date_identified date,
    rec_correctedby character varying(128),
    rec_datecorrected date,
    rec_type_status text,
    rec_verbatim_identification character varying(128) NOT NULL,
    rec_identification_qualifier character varying(30),
    rec_scientificname character varying(50),
    rec_scientific_name_authorship character varying(255),
    rec_kingdom character varying(30) NOT NULL,
    rec_phylum character varying(30),
    rec_class character varying(30),
    rec_subclass character varying(30),
    rec_order character varying(30),
    rec_family character varying(30),
    rec_subfamily character varying(30),
    rec_genus character varying(30),
    rec_specific_epithet character varying(30),
    rec_taxon_rank character varying(30) NOT NULL,
    rec_vernacular_name character varying(30),
    rec_use text,
    rec_habit character varying(30),
    rec_image text
);


ALTER TABLE public.records OWNER TO postgres;

--
-- TOC entry 216 (class 1259 OID 17996)
-- Name: services; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.services (
    ser_id integer NOT NULL,
    ser_title character varying(255) NOT NULL,
    ser_summary text NOT NULL,
    ser_image text NOT NULL,
    ser_position integer NOT NULL
);


ALTER TABLE public.services OWNER TO postgres;

--
-- TOC entry 215 (class 1259 OID 17995)
-- Name: services_ser_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.services_ser_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.services_ser_id_seq OWNER TO postgres;

--
-- TOC entry 3455 (class 0 OID 0)
-- Dependencies: 215
-- Name: services_ser_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.services_ser_id_seq OWNED BY public.services.ser_id;


--
-- TOC entry 214 (class 1259 OID 17985)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    use_doc_number integer NOT NULL,
    use_name character varying(50) NOT NULL,
    use_last_name character varying(50) NOT NULL,
    use_doc_type public.use_doc_type NOT NULL,
    use_code integer NOT NULL,
    use_mobile integer NOT NULL,
    use_address character varying(50) NOT NULL,
    use_email character varying(50) NOT NULL,
    use_password character varying(255) NOT NULL,
    use_role public.use_role NOT NULL,
    use_restore_code character varying(255)
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 18195)
-- Name: users_audit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users_audit (
    use_audit_id integer NOT NULL,
    operation_type character(1),
    operation_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    performed_by integer,
    use_doc_number integer,
    use_name character varying(50),
    use_last_name character varying(50),
    use_doc_type public.use_doc_type,
    use_code integer,
    use_mobile integer,
    use_address character varying(50),
    use_email character varying(50),
    use_role public.use_role
);


ALTER TABLE public.users_audit OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 18194)
-- Name: users_audit_use_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_audit_use_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_audit_use_audit_id_seq OWNER TO postgres;

--
-- TOC entry 3456 (class 0 OID 0)
-- Dependencies: 238
-- Name: users_audit_use_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_audit_use_audit_id_seq OWNED BY public.users_audit.use_audit_id;


--
-- TOC entry 218 (class 1259 OID 18011)
-- Name: workteam; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workteam (
    wor_id integer NOT NULL,
    wor_name character varying(50) NOT NULL,
    wor_charge character varying(50) NOT NULL,
    wor_experience character varying(255) NOT NULL,
    wor_summary text NOT NULL,
    wor_actual boolean NOT NULL,
    wor_image text NOT NULL,
    wor_position integer NOT NULL
);


ALTER TABLE public.workteam OWNER TO postgres;

--
-- TOC entry 217 (class 1259 OID 18010)
-- Name: workteam_wor_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.workteam_wor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.workteam_wor_id_seq OWNER TO postgres;

--
-- TOC entry 3457 (class 0 OID 0)
-- Dependencies: 217
-- Name: workteam_wor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.workteam_wor_id_seq OWNED BY public.workteam.wor_id;


--
-- TOC entry 3251 (class 2604 OID 18041)
-- Name: allies all_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.allies ALTER COLUMN all_id SET DEFAULT nextval('public.allies_all_id_seq'::regclass);


--
-- TOC entry 3252 (class 2604 OID 18050)
-- Name: bibliographies bib_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bibliographies ALTER COLUMN bib_id SET DEFAULT nextval('public.bibliographies_bib_id_seq'::regclass);


--
-- TOC entry 3256 (class 2604 OID 18116)
-- Name: bibliographies_audit bib_audit_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bibliographies_audit ALTER COLUMN bib_audit_id SET DEFAULT nextval('public.bibliographies_audit_audit_id_seq'::regclass);


--
-- TOC entry 3250 (class 2604 OID 18032)
-- Name: events eve_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events ALTER COLUMN eve_id SET DEFAULT nextval('public.events_eve_id_seq'::regclass);


--
-- TOC entry 3259 (class 2604 OID 18169)
-- Name: images img_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.images ALTER COLUMN img_id SET DEFAULT nextval('public.images_img_id_seq'::regclass);


--
-- TOC entry 3253 (class 2604 OID 18059)
-- Name: lends len_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lends ALTER COLUMN len_id SET DEFAULT nextval('public.lends_len_id_seq'::regclass);


--
-- TOC entry 3254 (class 2604 OID 18098)
-- Name: lends_audit len_audit_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lends_audit ALTER COLUMN len_audit_id SET DEFAULT nextval('public.lends_audit_audit_id_seq'::regclass);


--
-- TOC entry 3258 (class 2604 OID 18160)
-- Name: letters let_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.letters ALTER COLUMN let_id SET DEFAULT nextval('public.letters_let_id_seq'::regclass);


--
-- TOC entry 3249 (class 2604 OID 18023)
-- Name: projects pro_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects ALTER COLUMN pro_id SET DEFAULT nextval('public.projects_pro_id_seq'::regclass);


--
-- TOC entry 3247 (class 2604 OID 17999)
-- Name: services ser_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.services ALTER COLUMN ser_id SET DEFAULT nextval('public.services_ser_id_seq'::regclass);


--
-- TOC entry 3260 (class 2604 OID 18198)
-- Name: users_audit use_audit_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users_audit ALTER COLUMN use_audit_id SET DEFAULT nextval('public.users_audit_use_audit_id_seq'::regclass);


--
-- TOC entry 3248 (class 2604 OID 18014)
-- Name: workteam wor_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workteam ALTER COLUMN wor_id SET DEFAULT nextval('public.workteam_wor_id_seq'::regclass);


--
-- TOC entry 3275 (class 2606 OID 18045)
-- Name: allies allies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.allies
    ADD CONSTRAINT allies_pkey PRIMARY KEY (all_id);


--
-- TOC entry 3285 (class 2606 OID 18121)
-- Name: bibliographies_audit bibliographies_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bibliographies_audit
    ADD CONSTRAINT bibliographies_audit_pkey PRIMARY KEY (bib_audit_id);


--
-- TOC entry 3277 (class 2606 OID 18054)
-- Name: bibliographies bibliographies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bibliographies
    ADD CONSTRAINT bibliographies_pkey PRIMARY KEY (bib_id);


--
-- TOC entry 3273 (class 2606 OID 18036)
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (eve_id);


--
-- TOC entry 3289 (class 2606 OID 18173)
-- Name: images images_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.images
    ADD CONSTRAINT images_pkey PRIMARY KEY (img_id);


--
-- TOC entry 3283 (class 2606 OID 18101)
-- Name: lends_audit lends_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lends_audit
    ADD CONSTRAINT lends_audit_pkey PRIMARY KEY (len_audit_id);


--
-- TOC entry 3281 (class 2606 OID 18076)
-- Name: lends_bibliographies lends_bibliographies_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lends_bibliographies
    ADD CONSTRAINT lends_bibliographies_pk PRIMARY KEY (lend_id, bib_id);


--
-- TOC entry 3279 (class 2606 OID 18061)
-- Name: lends lends_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lends
    ADD CONSTRAINT lends_pkey PRIMARY KEY (len_id);


--
-- TOC entry 3287 (class 2606 OID 18164)
-- Name: letters letters_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.letters
    ADD CONSTRAINT letters_pkey PRIMARY KEY (let_id);


--
-- TOC entry 3271 (class 2606 OID 18027)
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (pro_id);


--
-- TOC entry 3293 (class 2606 OID 18209)
-- Name: records records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_pkey PRIMARY KEY (rec_catalog_number);


--
-- TOC entry 3267 (class 2606 OID 18009)
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (ser_id);


--
-- TOC entry 3263 (class 2606 OID 17992)
-- Name: users use_email; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT use_email UNIQUE (use_email);


--
-- TOC entry 3291 (class 2606 OID 18201)
-- Name: users_audit users_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users_audit
    ADD CONSTRAINT users_audit_pkey PRIMARY KEY (use_audit_id);


--
-- TOC entry 3265 (class 2606 OID 17989)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (use_doc_number);


--
-- TOC entry 3269 (class 2606 OID 18018)
-- Name: workteam workteam_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workteam
    ADD CONSTRAINT workteam_pkey PRIMARY KEY (wor_id);


--
-- TOC entry 3298 (class 2620 OID 17990)
-- Name: users check_user_role; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER check_user_role BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.check_user_role_func();


--
-- TOC entry 3294 (class 2606 OID 18082)
-- Name: lends_bibliographies fk_bibliography; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lends_bibliographies
    ADD CONSTRAINT fk_bibliography FOREIGN KEY (bib_id) REFERENCES public.bibliographies(bib_id) ON DELETE CASCADE;


--
-- TOC entry 3295 (class 2606 OID 18077)
-- Name: lends_bibliographies fk_lend; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lends_bibliographies
    ADD CONSTRAINT fk_lend FOREIGN KEY (lend_id) REFERENCES public.lends(len_id) ON DELETE CASCADE;


--
-- TOC entry 3296 (class 2606 OID 18184)
-- Name: images img_fk_letter; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.images
    ADD CONSTRAINT img_fk_letter FOREIGN KEY (img_fk_letter) REFERENCES public.letters(let_id) ON DELETE CASCADE;


--
-- TOC entry 3297 (class 2606 OID 18210)
-- Name: images img_fk_record; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.images
    ADD CONSTRAINT img_fk_record FOREIGN KEY (img_fk_record) REFERENCES public.records(rec_catalog_number) NOT VALID;


-- Completed on 2024-12-12 15:25:51

--
-- PostgreSQL database dump complete
--

