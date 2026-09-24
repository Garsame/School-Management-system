/**
 * importSchoolStudents.js
 * 
 * 1. Resets student records, enrollments, attendance, invoices, and counters.
 * 2. Sets up the 14 Academic Classes & Categories.
 * 3. Parses and cleans the 254 students from SYS ICT Solutions into the official template format.
 * 4. Saves clean Excel & CSV export files in the repository root.
 * 5. Imports all 254 students directly into the live school database with 'KS-2026-XXX' admission numbers.
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const ClassCategory = require('../models/ClassCategory');
const Class = require('../models/Class');
const Section = require('../models/Section');
const AcademicYear = require('../models/AcademicYear');
const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const User = require('../models/User');
const Counter = require('../models/Counter');
const ParentStudentLink = require('../models/ParentStudentLink');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceSession = require('../models/AttendanceSession');
const Result = require('../models/Result');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const { formatStudentCode } = require('../services/counterService');

// Raw HTML source data provided by the user
const RAW_HTML = `<tr><td>1</td><td>2</td><td>Burhan Hassan Muse Mohamed</td><td>617518869</td><td>Class 3</td><td>Hassan Muse Mohamed</td><td>615648340</td><td>New Student</td><td></td></tr><tr><td>2</td><td>3</td><td>Abdullahi Faisal Abdi</td><td>612497540</td><td>Class 1</td><td>ugbad iman ali</td><td>612497540</td><td>New Student</td><td></td></tr><tr><td>3</td><td>4</td><td>Warsame Abdiaziz Mohamed Abdi</td><td>61</td><td>Class 2</td><td>ugbad iman ali</td><td>612497540</td><td>New Student</td><td></td></tr><tr><td>4</td><td>5</td><td>Abdiaziz Mohamed Ahmed Mohamed</td><td>615922002</td><td>Form 3</td><td>Riham mohamed </td><td>613127955</td><td>New Student</td><td></td></tr><tr><td>5</td><td>8</td><td>Naima Abdullahi Abdirizak Abdullahi</td><td>615578150 615830328 </td><td>Form 3</td><td>sareedo abdinur</td><td>619988388</td><td>New Student</td><td></td></tr><tr><td>6</td><td>9</td><td>Akram Abdikadir Muhudin Khalif</td><td>619383333</td><td>Form 2</td><td>Abdikadir Muhudin Khalif</td><td>615383333</td><td>New Student</td><td></td></tr><tr><td>7</td><td>12</td><td>Ayan Abdikadir Muhudin Khalif</td><td>619383333</td><td>Form 3</td><td>Abdikadir Muhudin Khalif</td><td>615383333</td><td>New Student</td><td></td></tr><tr><td>8</td><td>13</td><td>Nasteha Hassan Abdi Hussein </td><td>619730792</td><td>Form 4</td><td>hassan abdi </td><td>619320445</td><td>New Student</td><td></td></tr><tr><td>9</td><td>14</td><td>Riham Nor Mahamed Abdalle</td><td>619017675</td><td>Form 3</td><td>Muna Aweys</td><td>619017675</td><td>New Student</td><td></td></tr><tr><td>10</td><td>15</td><td>Muscab Aidid Abdullahi Gure</td><td>614158776</td><td>Class 4</td><td>aidiid abdullahi gure </td><td>616360209</td><td>New Student</td><td></td></tr><tr><td>11</td><td>16</td><td>Amira Ahmed Ali</td><td>615575700</td><td>Class 5</td><td>Abdullahi Daud Mohamed /Ramla</td><td>617475904</td><td>New Student</td><td></td></tr><tr><td>12</td><td>19</td><td>Suleqa Mahamud Hassan </td><td>619730792</td><td>Class 5</td><td>mahamud hassan</td><td>61</td><td>New Student</td><td></td></tr><tr><td>13</td><td>21</td><td>Luul  Sidow Osman</td><td>619313140</td><td>Class 4</td><td>Muna sidow osman</td><td>615571378</td><td>New Student</td><td></td></tr><tr><td>14</td><td>24</td><td>Anas Abdikadir Muhudin Khalif</td><td>619383333</td><td>Class 8</td><td>Abdikadir Muhudin Khalif</td><td>615383333</td><td>New Student</td><td></td></tr><tr><td>15</td><td>31</td><td>Ahlam Mahdi Abdirahman Elmi</td><td>612497540</td><td>Class 4</td><td>ugbad iman ali</td><td>612497540</td><td>New Student</td><td></td></tr><tr><td>16</td><td>38</td><td>Rahima Mohamed Ali Mohamud</td><td>615780110 </td><td>Class 5</td><td>Hodan Nur Mohamed </td><td>619922247</td><td>New Student</td><td></td></tr><tr><td>17</td><td>39</td><td>Roda Abdinasir Ahmed </td><td>615407257 </td><td>Class 8</td><td>salah muqtar dahir </td><td>619605821</td><td>New Student</td><td></td></tr><tr><td>18</td><td>43</td><td>Mascuud Salah Muqtar Dahir</td><td>619605821</td><td>Form 1</td><td>salah muqtar dahir </td><td>619605821</td><td>New Student</td><td></td></tr><tr><td>19</td><td>44</td><td>Miski Salah Muqtar Dahir</td><td>619605821</td><td>Form 1</td><td>salah muqtar dahir </td><td>619605821</td><td>New Student</td><td></td></tr><tr><td>20</td><td>47</td><td>Said Khalid Mohamed Abdulkadir</td><td>611163481</td><td>Class 3</td><td>Abdalle ahmed	-Abdullahi Daud Mohamed  </td><td>617475904</td><td>New Student</td><td></td></tr><tr><td>21</td><td>48</td><td>Akram Abdullahi Hassan </td><td>617543413</td><td>Class 3</td><td>abdullhi hassan</td><td>615384297</td><td>New Student</td><td></td></tr><tr><td>22</td><td>49</td><td>Afnan Mahamed Ahmed Mohamed</td><td>617482082</td><td>Class 8</td><td>Riham mohamed </td><td>613127955</td><td>New Student</td><td></td></tr><tr><td>23</td><td>51</td><td>Salman Omar Mohamed Yusuf </td><td>618706666</td><td>Class 5</td><td>Omar Mohamed Yusuf </td><td>615501077</td><td>New Student</td><td></td></tr><tr><td>24</td><td>54</td><td>Mariya Abdinasir Musse</td><td>61</td><td>Class 1</td><td>Abdinasir Musse</td><td>619872250</td><td>New Student</td><td></td></tr><tr><td>25</td><td>55</td><td>Mahamed Amin Mahad  </td><td>616242731</td><td>Form 1</td><td>muse mohamed xaashi</td><td>617478708</td><td>New Student</td><td></td></tr><tr><td>26</td><td>56</td><td>Abdikadir Mahamed Abdullahi Farah</td><td>614913966</td><td>Class 1</td><td>mohamed abdisalam</td><td>615022667</td><td>New Student</td><td></td></tr><tr><td>27</td><td>57</td><td>Abdirahman Abdiwali Dahir</td><td>616181176</td><td>Class 3</td><td>muse mahamed</td><td>616181176</td><td>New Student</td><td></td></tr><tr><td>28</td><td>60</td><td>Amira Abdikadir Muhudin Khalif</td><td>615732382</td><td>Class 4</td><td>abdikadir muhudin khalif </td><td>615383333</td><td>New Student</td><td></td></tr><tr><td>29</td><td>71</td><td>Nucman Hussein Osman Abdi</td><td>616244466</td><td>Class 1</td><td>Muna Aweys</td><td>619017675</td><td>New Student</td><td></td></tr><tr><td>30</td><td>72</td><td>Harun Hussein Bashir Mohamud</td><td>615022667</td><td>Class 1</td><td>mohamed abdisalam</td><td>615022667</td><td>New Student</td><td></td></tr><tr><td>31</td><td>78</td><td>Ahlam Abdifatah Mohamed </td><td>N/A</td><td>Class 2</td><td>Abdinaser Hassan</td><td>619872250</td><td>New Student</td><td></td></tr><tr><td>32</td><td>86</td><td>Ramadan Abdikarim Mohamed Ahmed</td><td>617225603</td><td>Class 1</td><td>Muna Abdullahi</td><td>615929790</td><td>New Student</td><td></td></tr><tr><td>33</td><td>88</td><td>Nado Mohamed Ali Mohamed</td><td>615780110</td><td>Class 1</td><td>Hodan Nur Mohamed </td><td>619922247</td><td>New Student</td><td></td></tr><tr><td>34</td><td>89</td><td>Wajna Jihadudin Rage Ali</td><td>615074129</td><td>Topclass</td><td>Jihadudin Rage Ali</td><td>612227053</td><td>New Student</td><td></td></tr><tr><td>35</td><td>90</td><td>Manaal Ibrahim Musse </td><td>617023931</td><td>Class 3</td><td>Abdinasir Musse</td><td>619872250</td><td>New Student</td><td></td></tr><tr><td>36</td><td>91</td><td>Ibrahim Abdinasir Musse</td><td>617007605</td><td>Class 1</td><td>Abdinasir Musse</td><td>619872250</td><td>New Student</td><td></td></tr><tr><td>37</td><td>96</td><td>Ummulkhair Badri Osman Ahmed</td><td>61</td><td>Class 5</td><td>Umulkhair Moalin Abdirahman</td><td>616699778</td><td>Transfer Student</td><td>Bright Grammer </td></tr><tr><td>38</td><td>98</td><td>Badriya Abdullahi Abdukadir osman</td><td>61</td><td>Form 4</td><td>Umulkhair Moalin Abdirahman</td><td>616699778</td><td>Transfer Student</td><td>Bright Grammer</td></tr><tr><td>39</td><td>99</td><td>Abdiwali Abdullahi Abdulkadir Osman</td><td>61</td><td>Form 3</td><td>Umulkhair Moalin Abdirahman</td><td>616699778</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>40</td><td>100</td><td>Maqsuud Abdifatah Aden Amin</td><td>61</td><td>Form 1</td><td>Shukri Mohamud </td><td>615938413</td><td>Transfer Student</td><td>SYL</td></tr><tr><td>41</td><td>103</td><td>Sagal Mahamed Garaad Ibrahim</td><td>614474856</td><td>Class 1</td><td>Hidayo Abdirahman Hassan</td><td>615663426</td><td>Transfer Student</td><td>Turkish bright</td></tr><tr><td>42</td><td>107</td><td>Mohamed Adan Qadar Muqtar</td><td>615407257</td><td>Form 3</td><td>salah muqtar dahir </td><td>619605821</td><td>New Student</td><td>N/A</td></tr><tr><td>43</td><td>109</td><td>Zeytun Abdullahi Mohamed</td><td>61</td><td>Class 2</td><td>Abdullahi mohamed </td><td>615889982</td><td>New Student</td><td>N/A</td></tr><tr><td>44</td><td>110</td><td>Yusuf Mohamed Ali Mohamud</td><td>615780110</td><td>Class 1</td><td>Hodan Nur Mohamed </td><td>619922247</td><td>New Student</td><td>N/A</td></tr><tr><td>45</td><td>112</td><td>Zubeir Abukar Yusuf Mohamed</td><td>61</td><td>Class 2</td><td>Abdullahi Daud Mohamed /Ramla</td><td>617475904</td><td>New Student</td><td>N/A</td></tr><tr><td>46</td><td>113</td><td>Zaid Abukar Yusuf Mohamed</td><td>61</td><td>Class 2</td><td>Abdullahi Daud Mohamed /Ramla</td><td>617475904</td><td>New Student</td><td>N/A</td></tr><tr><td>47</td><td>114</td><td>Khalid Ibrahim Musse </td><td>617023931</td><td>Class 1</td><td>Abdinasir Musse</td><td>619872250</td><td>Transfer Student</td><td>Hilaal internation</td></tr><tr><td>48</td><td>120</td><td>Abdalle Husein Abukar </td><td>61</td><td>Class 1</td><td>samira hussein</td><td>612409546</td><td>New Student</td><td>N/A</td></tr><tr><td>49</td><td>123</td><td>Najwa Kassim Haji Hussein</td><td>615497777 </td><td>Class 2</td><td>Kassim Haji Hussein</td><td>615497777</td><td>Transfer Student</td><td>mucasir school</td></tr><tr><td>50</td><td>126</td><td>Wasem Jihadudin Rage Ali</td><td>615074129</td><td>Class 1</td><td>Jihadudin Rage Ali</td><td>612227053</td><td>Transfer Student</td><td>yemen </td></tr><tr><td>51</td><td>128</td><td>Siham Khalid Mohamed Abdulkadir</td><td>615252554</td><td>Class 2</td><td>Abdalle ahmed	-Abdullahi Daud Mohamed  </td><td>617475904</td><td>Transfer Student</td><td>york school</td></tr><tr><td>52</td><td>131</td><td>Aisha Ali Yusuf </td><td>Abdinasir Musse</td><td>Class 4</td><td>Abdinasir Musse</td><td>619872250</td><td>Transfer Student</td><td>hilaal</td></tr><tr><td>53</td><td>132</td><td>Khalid Hadi Sirad Omar </td><td>615346436</td><td>Class 5</td><td>Fatima a/man ibrahim</td><td>616773192</td><td>New Student</td><td>N/A</td></tr><tr><td>54</td><td>133</td><td>Yusra Daud Mohamed Osman </td><td>61</td><td>Class 5</td><td>Abdullahi Daud Mohamed /Ramla</td><td>617475904</td><td>Transfer Student</td><td>Al  hima </td></tr><tr><td>55</td><td>137</td><td>Abdiqani Mohamed Ahmed Mohamed</td><td>617482082</td><td>Class 4</td><td>Riham mohamed </td><td>613127955</td><td>New Student</td><td>N/A</td></tr><tr><td>56</td><td>138</td><td>Abdirahman Mohamed Dahir Mohamud</td><td>61</td><td>Class 4</td><td>Hassan osman </td><td>628817708</td><td>New Student</td><td>N/A</td></tr><tr><td>57</td><td>141</td><td>Abdirahiim Bashir Mohamed Jimale</td><td>615176517</td><td>Class 8</td><td>bashir mohamed</td><td>615799030</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>58</td><td>142</td><td>Amar Mohamed Abdullahi Hassan</td><td>615690434</td><td>Class 8</td><td>Riham mohamed </td><td>613127955</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>59</td><td>143</td><td>Abdirahman Mahdi Abdirahman Elmi</td><td>612497540</td><td>Class 8</td><td>ugbad iman ali</td><td>612497540</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>60</td><td>145</td><td>Hamdi Hadi Sirad Omar</td><td>615346436</td><td>Class 8</td><td>Fatima a/man ibrahim</td><td>616773192</td><td>New Student</td><td>N/A</td></tr><tr><td>61</td><td>147</td><td>Abdalle Salah Muktar Dahir</td><td>61</td><td>Class 5</td><td>salah muqtar dahir </td><td>619605821</td><td>New Student</td><td>N/A</td></tr><tr><td>62</td><td>148</td><td>Hibo  Abdikadir Mohamud Nur</td><td>61</td><td>Class 8</td><td>Ali Mohamud Nur</td><td>61</td><td>New Student</td><td>N/A</td></tr><tr><td>63</td><td>153</td><td>Sumayo Hassan Abdi Hussein</td><td>61</td><td>Class 8</td><td>abdirisak hasan </td><td>619320445</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>64</td><td>158</td><td>Anas Mohamed Salah </td><td>61</td><td>Class 8</td><td>Halima Mohamud</td><td>613402985</td><td>Transfer Student</td><td>s.y.l</td></tr><tr><td>65</td><td>160</td><td>Khadija Mahdi Hassan</td><td>61</td><td>Class 2</td><td>farhiyo mohamed hassan</td><td>615178424</td><td>New Student</td><td>N/A</td></tr><tr><td>66</td><td>164</td><td>Iqbaal Abdulkadir Awale Nuur </td><td>61</td><td>Form 3</td><td>Abdulkadir awale nuur</td><td>615480655</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>67</td><td>168</td><td>Ibrahim Yusuf Ahmed Ismail </td><td>618726178</td><td>Class 8</td><td>Yusuf Ahmed Ismail</td><td>615279884</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>68</td><td>169</td><td>Iqlas Ali Mohamed Nor </td><td>61</td><td>Class 8</td><td>Bishaaro maxamud </td><td>615168915</td><td>New Student</td><td>N/A</td></tr><tr><td>69</td><td>170</td><td>Aisha Yusuf Ahmed Ismail </td><td>61</td><td>Form 1</td><td>Yusuf Ahmed Ismail</td><td>615279884</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>70</td><td>171</td><td>Mascud Abdullahi Mohamed Abdikarim</td><td>615563037</td><td>Class 5</td><td>Abdullahi Mohamed Abdikarim</td><td>615889982</td><td>Transfer Student</td><td>AL.Asal </td></tr><tr><td>71</td><td>172</td><td>Yuusuf Abdullahi Mohamed Abdikarim</td><td>615481021</td><td>Class 5</td><td>Abdullahi Mohamed Abdikarim</td><td>615889982</td><td>Transfer Student</td><td>Al.Asal </td></tr><tr><td>72</td><td>173</td><td>Afnan Abdullahi Mohamed Abdikarim</td><td>615481021</td><td>Class 5</td><td>Abdullahi Mohamed Abdikarim</td><td>615889982</td><td>New Student</td><td>N/A</td></tr><tr><td>73</td><td>175</td><td>Sumaya Salah Muktar Dahir</td><td>615407257 </td><td>Class 4</td><td>salah muqtar dahir </td><td>619605821</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>74</td><td>176</td><td>Sihaam Mohamud Hassan </td><td>61</td><td>Class 5</td><td>Mohamud hassan </td><td>619730792</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>75</td><td>177</td><td>Mohamed Omar Mohamed Yusuf </td><td>618706666</td><td>Class 5</td><td>Omar Mohamed Yusuf </td><td>615501077</td><td>New Student</td><td>N/A</td></tr><tr><td>76</td><td>181</td><td>Bashir Ahmed Salad Shiqow </td><td>61</td><td>Class 3</td><td>Ahmed Salad Shiqow </td><td>613058968</td><td>New Student</td><td>N/A</td></tr><tr><td>77</td><td>182</td><td>Abas Sidow Osman Abdi</td><td>619313140</td><td>Class 3</td><td>Muna sidow osman</td><td>615571378</td><td>New Student</td><td>N/A</td></tr><tr><td>78</td><td>183</td><td>Ahlam Ahmed Ali</td><td>615575770</td><td>Class 3</td><td>Abdullahi Daud Mohamed /Ramla</td><td>617475904</td><td>Transfer Student</td><td>Al Hima</td></tr><tr><td>79</td><td>184</td><td>Mahir Abdifatah Adan </td><td>61</td><td>Class 3</td><td>Bisharo mohamud </td><td>615168975</td><td>New Student</td><td>N/A</td></tr><tr><td>80</td><td>185</td><td>Abdirahman Abdullahi Mohamed Abdikarim</td><td>615563037</td><td>Class 3</td><td>Abdullahi Mohamed Abdikarim</td><td>615889982</td><td>New Student</td><td>N/A</td></tr><tr><td>81</td><td>187</td><td>Omar Mohamed Isaaq Osman </td><td>61</td><td>Form 1</td><td>mohamed isaaq osman</td><td>617068234</td><td>New Student</td><td>N/A</td></tr><tr><td>82</td><td>190</td><td>Abdirahman Yusuf Ahmed Ismail</td><td>61</td><td>Topclass</td><td>Yusuf Ahmed Ismail</td><td>615279884</td><td>New Student</td><td>N/A</td></tr><tr><td>83</td><td>194</td><td>Idris Ibrahim Musse</td><td>617023931</td><td>Class 2</td><td>Abdinasir Musse</td><td>619872250</td><td>New Student</td><td>N/A</td></tr><tr><td>84</td><td>197</td><td>Ashraf Abdikadir Muhudin Khalif       </td><td>615732382</td><td>Class 2</td><td>Abdikadir Muhudin Khalif</td><td>615383333</td><td>New Student</td><td>N/A</td></tr><tr><td>85</td><td>198</td><td>Sumayo Abdimajid Mohamed Mohamud </td><td>613712889, </td><td>Class 1</td><td>Abdimajid Mohamed Mohamud </td><td>612519736, 613712889</td><td>New Student</td><td>N/A</td></tr><tr><td>86</td><td>200</td><td>Sabarin Khalid Mohamed Abdulkadir</td><td>615252554</td><td>Class 1</td><td>Abdalle ahmed	-Abdullahi Daud Mohamed  </td><td>617475904</td><td>New Student</td><td>N/A</td></tr><tr><td>87</td><td>201</td><td>Hidayo Ahmed Ibrahim </td><td>615187700</td><td>Class 2</td><td>Abdullahi Daud Mohamed /Ramla</td><td>617475904</td><td>New Student</td><td>N/A</td></tr><tr><td>88</td><td>204</td><td>Marwan Ismail Mohamed Ali</td><td>615041720 </td><td>Topclass</td><td>Ismail Mohamed Ali</td><td>615304261</td><td>New Student</td><td>N/A</td></tr><tr><td>89</td><td>205</td><td>Munir Ismail Mohamed Ali</td><td>615041720</td><td>Class 2</td><td>Ismail Mohamed Ali</td><td>615304261</td><td>New Student</td><td>N/A</td></tr><tr><td>90</td><td>206</td><td>Akram Ali Mohamud Hillowle</td><td>61</td><td>Topclass</td><td>Bishaaro mohamud </td><td>615168975</td><td>New Student</td><td>N/A</td></tr><tr><td>91</td><td>207</td><td>Almas Ali Mohamud Hillowle</td><td>61</td><td>Class 2</td><td>Bishaaro mohamud </td><td>615168975</td><td>New Student</td><td>N/A</td></tr><tr><td>92</td><td>209</td><td>Mushtaq Mohamud Hassan </td><td>61</td><td>Class 2</td><td>Mohamud hassan </td><td>619730792</td><td>New Student</td><td>N/A</td></tr><tr><td>93</td><td>210</td><td>Hibo Ahmed Salad Shiqow </td><td>61</td><td>Class 2</td><td>Ahmed Salad Shiqow </td><td>613058968</td><td>New Student</td><td>N/A</td></tr><tr><td>94</td><td>212</td><td>Suhayla Sadaq Mohamud Dahir</td><td>61</td><td>Class 2</td><td>Sadaq mohamud </td><td>615214213</td><td>New Student</td><td>N/A</td></tr><tr><td>95</td><td>213</td><td>Abdirahman Abdiaziz Yusuf Diini</td><td>61</td><td>Class 2</td><td>Abdiasis yusuf</td><td>615888850</td><td>New Student</td><td>N/A</td></tr><tr><td>96</td><td>214</td><td>Sitey Sidow Osman</td><td>619313140</td><td>Class 2</td><td>Muna sidow osman</td><td>615571378</td><td>New Student</td><td>N/A</td></tr><tr><td>97</td><td>223</td><td>Adan Abdulkadir Nor Abdi</td><td>614924492</td><td>Baby class</td><td>Rahma Ahmed Mohamed </td><td>616677805</td><td>New Student</td><td>N/A</td></tr><tr><td>98</td><td>224</td><td>Fatima Abdulkadir Nor Abdi</td><td>614924492</td><td>Class 1</td><td>Rahma Ahmed Mohamed </td><td>616677805</td><td>New Student</td><td>N/A</td></tr><tr><td>99</td><td>226</td><td>Sucaado Abdulkadir Nor Abdi</td><td>614924492</td><td>Class 5</td><td>Rahma Ahmed Mohamed </td><td>616677805</td><td>New Student</td><td>N/A</td></tr><tr><td>100</td><td>227</td><td>Fardowsa Abdulkadir Nor Abdi</td><td>614924492</td><td>Class 2</td><td>Rahma Ahmed Mohamed </td><td>616677805</td><td>New Student</td><td>N/A</td></tr><tr><td>101</td><td>229</td><td>Abdirahim Ahmed Abdi Ahmed</td><td>61</td><td>Class 2</td><td>Hassan osman nur </td><td>618817708</td><td>New Student</td><td>N/A</td></tr><tr><td>102</td><td>230</td><td>Suweyda Abdulkadir Nor Abdi</td><td>0614924492</td><td>Class 8</td><td>Rahma Ahmed Mohamed </td><td>616677805</td><td>New Student</td><td>N/A</td></tr><tr><td>103</td><td>231</td><td>Saed Ahmed Hassan Farah</td><td>61</td><td>Class 3</td><td>Ahmed hassan farah </td><td>610443821</td><td>New Student</td><td>N/A</td></tr><tr><td>104</td><td>235</td><td>Abdisalam Abdi Mohamed </td><td>61</td><td>Class 1</td><td>Qaali awaale hassan</td><td>618223815</td><td>New Student</td><td>N/A</td></tr><tr><td>105</td><td>236</td><td>Mahamed Abdimajid Mohamed Mohamud</td><td>613712889</td><td>Class 3</td><td>Abdimajid Mohamed Mohamud </td><td>612519736</td><td>New Student</td><td>N/A</td></tr><tr><td>106</td><td>237</td><td>Yahye Iman Ali Warsame</td><td>612497540</td><td>Class 5</td><td>ugbad iman ali</td><td>612497540</td><td>New Student</td><td>N/A</td></tr><tr><td>107</td><td>238</td><td>Yacqub Iman Ali Warsame</td><td>61</td><td>Form 1</td><td>ugbad iman ali</td><td>612497540</td><td>New Student</td><td>N/A</td></tr><tr><td>108</td><td>239</td><td> Susan Abdirahman Ahmed Ali </td><td>61</td><td>Class 4</td><td>Abdirahman ahmed</td><td>615134070</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>109</td><td>240</td><td>Abdirahman Ayoub Hussein Ahmed</td><td>615054114</td><td>Class 2</td><td>Ayoub Hussein Ahmed</td><td>615553555</td><td>Transfer Student</td><td>Hilaal internal </td></tr><tr><td>110</td><td>241</td><td>Amal Ayoub Hussein Ahmed</td><td>615054114</td><td>Class 3</td><td>Ayoub Hussein Ahmed</td><td>615553555</td><td>New Student</td><td>N/A</td></tr><tr><td>111</td><td>242</td><td>Adnan Mohamed Hussein Hirsi</td><td>61</td><td>Form 1</td><td>Fatima a/man ibrahim</td><td>616773192</td><td>Transfer Student</td><td>Muqdisho</td></tr><tr><td>112</td><td>243</td><td>Abdirahman Mohamed Hussein Hirsi</td><td>61</td><td>Form 4</td><td>Fatima a/man ibrahim</td><td>616773192</td><td>Transfer Student</td><td>Muqdisho</td></tr><tr><td>113</td><td>246</td><td>Mohamed AbdiHafiid Mohamed</td><td>61</td><td>Topclass</td><td>Mohamed AbdiHafiid Mohamed</td><td>615874514</td><td>New Student</td><td>N/A</td></tr><tr><td>114</td><td>247</td><td>Ahmed Nor Mohamed Guled</td><td>619922247</td><td>Class 5</td><td>Hodan Nur Mohamed </td><td>619922247</td><td>Transfer Student</td><td>Hilal international</td></tr><tr><td>115</td><td>248</td><td>Ascad Abukar Mohamed Osman Mohamed </td><td>61</td><td>Class 2</td><td>faaduma mohamed osman</td><td>615054114</td><td>Transfer Student</td><td>Hilal intertion</td></tr><tr><td>116</td><td>251</td><td>Safwan muse mohamed xaashi</td><td>61</td><td>Topclass</td><td>muse mohamed xaashi</td><td>617478708</td><td>New Student</td><td>N/A</td></tr><tr><td>117</td><td>253</td><td>Shucayb abdisalan ali warsame </td><td>61</td><td>Form 2</td><td>ugbad iman ali</td><td>612497540</td><td>New Student</td><td>N/A</td></tr><tr><td>118</td><td>254</td><td>Abdullahi Abdikarim Yusuf Mohamed</td><td>61</td><td>Class 5</td><td>abdikarim yusuf </td><td>615369712</td><td>Transfer Student</td><td>iman school</td></tr><tr><td>119</td><td>256</td><td>ALI ISSE ALI ABUKAR</td><td>61</td><td>Class 3</td><td>HODAN HASSAN MAHAMED</td><td>616091894</td><td>Transfer Student</td><td>Hilal intertion</td></tr><tr><td>120</td><td>257</td><td>Nadar Mohamed Omar Ali</td><td>61</td><td>Class 2</td><td>mahamed omar ali</td><td>615970427</td><td>New Student</td><td>N/A</td></tr><tr><td>121</td><td>258</td><td>Maryan Abdirahman Mohamed Mahad</td><td>61</td><td>Class 1</td><td>Abdikadir Khalif</td><td>615532874</td><td>New Student</td><td>N/A</td></tr><tr><td>122</td><td>259</td><td>Siham Abdirahman Ahmed Habiil</td><td>61</td><td>Class 1</td><td>Abdikadir Khalif</td><td>615532874</td><td>New Student</td><td>N/A</td></tr><tr><td>123</td><td>264</td><td>Ilhan Abdirahman Muhudin Khalif</td><td>61</td><td>Class 2</td><td>Abdikadir Khalif</td><td>615532874</td><td>New Student</td><td>N/A</td></tr><tr><td>124</td><td>266</td><td>Ayanle Ahmed Cadani Mahamed</td><td>615844348</td><td>Class 8</td><td>ubah xasan gutale </td><td>615381250, 615844348</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>125</td><td>268</td><td>Abdiwali Abdullahi Mohamed Ibrahim </td><td>61</td><td>Form 2</td><td>abdiqani abdullahi mohamed</td><td>615207743</td><td>Transfer Student</td><td>al ma muun</td></tr><tr><td>126</td><td>269</td><td>Ali Abdullahi Mohamed Ibrahim</td><td>61</td><td>Form 2</td><td>abdiqani abdullahi mohamed</td><td>615207743</td><td>Transfer Student</td><td>geere</td></tr><tr><td>127</td><td>270</td><td>Seynab Abdullahi Mohamed Ibrahim</td><td>61</td><td>Class 1</td><td>abdiqani abdullahi mohamed</td><td>615207743</td><td>New Student</td><td>N/A</td></tr><tr><td>128</td><td>271</td><td>Sumayo Abdullahi Mohamed Ibrahim</td><td>61</td><td>Class 5</td><td>abdiqani abdullahi mohamed</td><td>615207743</td><td>New Student</td><td>N/A</td></tr><tr><td>129</td><td>272</td><td>Abdishakur Abdullahi Mohamed Ibrahim</td><td>61</td><td>Topclass</td><td>abdiqani abdullahi mohamed</td><td>615207743</td><td>New Student</td><td>N/A</td></tr><tr><td>130</td><td>273</td><td>Hamdi Abdullahi Mohamed Ibrahim</td><td>61</td><td>Class 3</td><td>abdiqani abdullahi mohamed</td><td>615207743</td><td>New Student</td><td>N/A</td></tr><tr><td>131</td><td>274</td><td>Nadra abdiaziiz mohamed ali</td><td>61</td><td>Class 1</td><td>safiyo adan osman </td><td>615545756</td><td>New Student</td><td>N/A</td></tr><tr><td>132</td><td>275</td><td>Nuuh Abdiaziiz Mohamed </td><td>61</td><td>Class 2</td><td>safiyo adan osman </td><td>615545756</td><td>New Student</td><td>N/A</td></tr><tr><td>133</td><td>276</td><td>Abdullahi Mohamed Osman Abdulkadir </td><td>61</td><td>Class 2</td><td>Mohamed Osman Abdulkadir </td><td>610111107</td><td>Transfer Student</td><td>new janaration</td></tr><tr><td>134</td><td>277</td><td>Fahdi Osman Abdulkadir Mohamed</td><td>61</td><td>Class 1</td><td>Mohamed Osman Abdulkadir </td><td>610111107</td><td>Transfer Student</td><td>new jannration</td></tr><tr><td>135</td><td>278</td><td>Ahmed Mohamed Osman Abdulkadir</td><td>61</td><td>Topclass</td><td>Mohamed Osman Abdulkadir </td><td>610111107</td><td>New Student</td><td>N/A</td></tr><tr><td>136</td><td>279</td><td>Aminakiin Mohamed Osman Abdulkadir</td><td>61</td><td>Topclass</td><td>Mohamed Osman Abdulkadir </td><td>610111107</td><td>Transfer Student</td><td>new jannaration</td></tr><tr><td>137</td><td>280</td><td>Faysal Mohamed Osman Abdulkadir </td><td>61</td><td>Class 1</td><td>Mohamed Osman Abdulkadir </td><td>610111107</td><td>Transfer Student</td><td>new jannaration</td></tr><tr><td>138</td><td>282</td><td>Afnaan Mohamed Bare </td><td>61</td><td>Class 1</td><td>deko salad bare</td><td>618185509</td><td>Transfer Student</td><td>new generation</td></tr><tr><td>139</td><td>283</td><td>Ayoub Ibrahim Muse</td><td>61</td><td>Form 2</td><td>Abdinasir Musse</td><td>619872250</td><td>Transfer Student</td><td>mogdisho primary seconday </td></tr><tr><td>140</td><td>284</td><td>Ashraf ahmed isse haji isse</td><td>61</td><td>Topclass</td><td>Ahmed isse haji</td><td>615583399</td><td>New Student</td><td>N/A</td></tr><tr><td>141</td><td>285</td><td>Akram Ahmed Isse Haji </td><td>61</td><td>Class 1</td><td>ahmed isse haji</td><td>615583399</td><td>Transfer Student</td><td>yemen </td></tr><tr><td>142</td><td>286</td><td>Akram mohamed bare </td><td>61</td><td>Class 2</td><td>deko salad isaq </td><td>618185509</td><td>Transfer Student</td><td>new generation</td></tr><tr><td>143</td><td>287</td><td>Abdulkadir ahmed Jeylani</td><td>61</td><td>Class 4</td><td>AHMED YEEYLAANI </td><td>615064834</td><td>New Student</td><td>N/A</td></tr><tr><td>144</td><td>288</td><td>Ahmed osman ahmed mohamed</td><td>61</td><td>Form 2</td><td>OSMAN AHMED MOHAMED</td><td>615965013</td><td>Transfer Student</td><td>ileys</td></tr><tr><td>145</td><td>290</td><td>Balqiisa osman ahmed mohamed</td><td>61</td><td>Class 5</td><td>OSMAN AHMED MOHAMED</td><td>615965013</td><td>Transfer Student</td><td>ileys</td></tr><tr><td>146</td><td>291</td><td>Abdulbari osman ahmed mohamed </td><td>61</td><td>Class 8</td><td>OSMAN AHMED MOHAMED</td><td>615965013</td><td>Transfer Student</td><td>ileys</td></tr><tr><td>147</td><td>292</td><td>Salima osman ahmed mohamed</td><td>61</td><td>Class 8</td><td>OSMAN AHMED MOHAMED</td><td>615965013</td><td>Transfer Student</td><td>ILEYS</td></tr><tr><td>148</td><td>296</td><td>maziN abubakar omar hamza</td><td></td><td>Topclass</td><td>hajiro abukar</td><td>619304442</td><td>New Student</td><td>N/A</td></tr><tr><td>149</td><td>297</td><td>Muayid Ahmed Mohamed Ali</td><td>61</td><td>Class 1</td><td>hajiro abukar</td><td>619304442</td><td>New Student</td><td>N/A</td></tr><tr><td>150</td><td>302</td><td>nura muhudin faqay </td><td>61</td><td>Form 1</td><td>hajiro abukar</td><td>619304442</td><td>New Student</td><td>N/A</td></tr><tr><td>151</td><td>303</td><td>yahya muhudin faqay </td><td>61</td><td>Form 1</td><td>hajiro abukar</td><td>619304442</td><td>New Student</td><td>N/A</td></tr><tr><td>152</td><td>305</td><td>ilwaad abdikani abdullahi farah</td><td>61</td><td>Topclass</td><td>abdikani abdullahi </td><td>615198680</td><td>New Student</td><td>N/A</td></tr><tr><td>153</td><td>306</td><td>Hafsa osman ahmed mohamed </td><td>61</td><td>Topclass</td><td>OSMAN AHMED MOHAMED</td><td>615965013</td><td>New Student</td><td>N/A</td></tr><tr><td>154</td><td>307</td><td>Hassan abukar ibraahim osman </td><td>61</td><td>Form 3</td><td>nuur ibrahim osman</td><td>617955055</td><td>Transfer Student</td><td>Emaan shafici </td></tr><tr><td>155</td><td>308</td><td>Ayan Ibrahim Muhudin Mohamed</td><td>61</td><td>Class 1</td><td>Abdinasir Musse</td><td>619872250</td><td>New Student</td><td>N/A</td></tr><tr><td>156</td><td>309</td><td>Abdullahi Mohamed muhudin </td><td>61</td><td>Topclass</td><td>Abdinasir Musse</td><td>619872250</td><td>New Student</td><td>N/A</td></tr><tr><td>157</td><td>314</td><td>Anfac bashiir ahmed mohamed </td><td>61</td><td>Form 2</td><td>khadija hassan said </td><td>612020096</td><td>Transfer Student</td><td>mogadisho international</td></tr><tr><td>158</td><td>315</td><td>Hanad Mohamed Abdihalim </td><td>61</td><td>Class 2</td><td>mohamed abdihalim</td><td>616140777</td><td>New Student</td><td>N/A</td></tr><tr><td>159</td><td>316</td><td>iqbal mohamed ali </td><td>61</td><td>Topclass</td><td>qadra abdi ali </td><td>614414118, 615414118</td><td>Transfer Student</td><td>ifiye </td></tr><tr><td>160</td><td>317</td><td>ahmed mustafa awees ahmed </td><td>619017675</td><td>Class 5</td><td>DAHABO MOHAMED</td><td>619017675</td><td>New Student</td><td>N/A</td></tr><tr><td>161</td><td>320</td><td>seynab salah muktar dahir</td><td>61</td><td>Topclass</td><td>salah muqtar dahir </td><td>619605821</td><td>New Student</td><td>N/A</td></tr><tr><td>162</td><td>321</td><td>Ayni Ali Yusuf Ali</td><td>61</td><td>Class 1</td><td>Abdinaser Hassan</td><td>619872250</td><td>New Student</td><td>N/A</td></tr><tr><td>163</td><td>322</td><td>layan ahmed mohamed ali</td><td>61</td><td>Topclass</td><td>hajiro abukar</td><td>619304442</td><td>New Student</td><td>N/A</td></tr><tr><td>164</td><td>328</td><td>Miski Dahir Mahdi Hassam </td><td>61</td><td>Class 2</td><td>daahir mahdi hassan </td><td>615515791</td><td>Transfer Student</td><td>mucaasir</td></tr><tr><td>165</td><td>329</td><td>mohamed daahir mahdi </td><td>61</td><td>Class 5</td><td>daahir mahdi hassan </td><td>615515791</td><td>Transfer Student</td><td>mucaasir</td></tr><tr><td>166</td><td>330</td><td>salma hamza abdalle </td><td>619006850</td><td>Class 4</td><td>Sahra mahdi hassan </td><td>0771843531</td><td>Transfer Student</td><td>mucasir </td></tr><tr><td>167</td><td>331</td><td>munasar daahir mahdi hassan </td><td>61</td><td>Class 3</td><td>daahir mahdi hassan </td><td>615515791</td><td>Transfer Student</td><td>mucasir</td></tr><tr><td>168</td><td>332</td><td>mudasir dahir mahdi hassan </td><td>61</td><td>Topclass</td><td>daahir mahdi hassan </td><td>615515791</td><td>New Student</td><td>N/A</td></tr><tr><td>169</td><td>333</td><td>musamil daahir mahdi hassan </td><td>61</td><td>Topclass</td><td>daahir mahdi hassan </td><td>615515791</td><td>New Student</td><td>N/A</td></tr><tr><td>170</td><td>334</td><td>maryan maxamed suleman </td><td>61</td><td>Form 2</td><td>fadumo maxamed osman </td><td>617272278</td><td>Transfer Student</td><td>imram bunu hussen </td></tr><tr><td>171</td><td>335</td><td>hamza liban ahmed</td><td>613738444</td><td>Form 4</td><td>Hamuun Ahmed</td><td>619316192</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>172</td><td>336</td><td>Mahamed liban ahmed </td><td>613738444</td><td>Form 4</td><td>Hamuun Ahmed</td><td>619316192</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>173</td><td>339</td><td>luul liban ahmed </td><td>61</td><td>Class 8</td><td>Hamuun Ahmed</td><td>619316192</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>174</td><td>341</td><td>sadak ibrahin muhudin </td><td>61</td><td>Topclass</td><td>Abdinasir Musse</td><td>619872250</td><td>New Student</td><td>N/A</td></tr><tr><td>175</td><td>342</td><td>suheyb ibrahin muhudin</td><td>61</td><td>Topclass</td><td>Abdinasir Musse</td><td>619872250</td><td>New Student</td><td>N/A</td></tr><tr><td>176</td><td>343</td><td>Aisho mahamed muxudin mahamud</td><td>61</td><td>Topclass</td><td>Abdinasir Musse</td><td>619872250</td><td>New Student</td><td>N/A</td></tr><tr><td>177</td><td>344</td><td>muxudin maxamed muxudin maxamed</td><td>61</td><td>Topclass</td><td>Abdinasir Musse</td><td>619872250</td><td>New Student</td><td>N/A</td></tr><tr><td>178</td><td>345</td><td>  muqtar ibraahim mohamed adow </td><td>61</td><td>Class 2</td><td>ibrahim mohamed </td><td>615139213</td><td>Transfer Student</td><td>Global school</td></tr><tr><td>179</td><td>346</td><td>samir ibrahim mohahamed adow </td><td>61</td><td>Class 4</td><td>ibrahim mohamed </td><td>615139213</td><td>Transfer Student</td><td>global school</td></tr><tr><td>180</td><td>347</td><td>ilhan ibrahim mohamed adow</td><td>61</td><td>Topclass</td><td>ibrahim mohamed </td><td>615139213</td><td>New Student</td><td>N/A</td></tr><tr><td>181</td><td>348</td><td>said ibrahim mohamed adow </td><td>61</td><td>Class 5</td><td>ibrahim mohamed </td><td>615139213</td><td>Transfer Student</td><td>global school</td></tr><tr><td>182</td><td>349</td><td>cimran ibrahim muhudin mohamed</td><td>61</td><td>Topclass</td><td>Abdinasir Musse</td><td>619872250</td><td>New Student</td><td>N/A</td></tr><tr><td>183</td><td>350</td><td>mahir alas abukar jimale</td><td>61</td><td>Form 2</td><td>Alas abukar jimale</td><td>613509988</td><td>Transfer Student</td><td>st juliet interated</td></tr><tr><td>184</td><td>351</td><td>mahado Alas abukar</td><td>61</td><td>Form 2</td><td>Alas abukar jimale</td><td>613509988</td><td>Transfer Student</td><td>st juliet integrated</td></tr><tr><td>185</td><td>352</td><td>iqlaas darik muse hassan </td><td>61</td><td>Baby class</td><td>darik muse </td><td>615480655</td><td>New Student</td><td>N/A</td></tr><tr><td>186</td><td>354</td><td>mohamed abdullahi salad</td><td>61</td><td>Topclass</td><td>abdullahi salad </td><td>615650030</td><td>New Student</td><td>N/A</td></tr><tr><td>187</td><td>355</td><td>Ahlam hussein abdullahi sheikh</td><td>61</td><td>Class 1</td><td>zahra abdullahi ali</td><td>615317523</td><td>New Student</td><td>N/A</td></tr><tr><td>188</td><td>356</td><td>Asma hussein abdullahi </td><td>61</td><td>Topclass</td><td>zahra abdullahi ali</td><td>615317523</td><td>New Student</td><td>N/A</td></tr><tr><td>189</td><td>357</td><td>mahamed amin hussein abdullahi </td><td>61</td><td>Topclass</td><td>zahra abdullahi ali</td><td>615317523</td><td>New Student</td><td>N/A</td></tr><tr><td>190</td><td>358</td><td>salim mohamed abdullahi ali </td><td>61</td><td>Topclass</td><td>zahra abdullahi ali</td><td>615317523</td><td>New Student</td><td>N/A</td></tr><tr><td>191</td><td>359</td><td>suweyda daud mohamed osman </td><td>61</td><td>Class 8</td><td>Ramlo daud maxamed</td><td>617475904</td><td>Transfer Student</td><td>Bright grammer</td></tr><tr><td>192</td><td>361</td><td>Abdullahi mohamed abdullahi </td><td>61</td><td>Class 1</td><td>deeqo abdi alasow </td><td>615727320, 616784401</td><td>New Student</td><td>N/A</td></tr><tr><td>193</td><td>362</td><td>abdimajid muse mohamed osman </td><td>61</td><td>Class 5</td><td>muse mohamed osman </td><td>615279311</td><td>Transfer Student</td><td>royal muslim</td></tr><tr><td>194</td><td>363</td><td>abdirahman muse mohamed</td><td>61</td><td>Class 5</td><td>muse mohamed osman </td><td>615279311</td><td>Transfer Student</td><td>royal muslin</td></tr><tr><td>195</td><td>365</td><td>abdullahi dauud abdullahi idow</td><td>61</td><td>Topclass</td><td>dauud abdullahi idow</td><td>617514128, 617775999</td><td>New Student</td><td>N/A</td></tr><tr><td>196</td><td>366</td><td>Amiira daud abdullahi idow</td><td>61</td><td>Class 1</td><td>dauud abdullahi idow</td><td>617514128, 617775999</td><td>New Student</td><td>N/A</td></tr><tr><td>197</td><td>367</td><td>anas sadek adawe olow </td><td>61</td><td>Baby class</td><td>fatuma abdiwali</td><td>613796667</td><td>New Student</td><td>N/A</td></tr><tr><td>198</td><td>368</td><td>murad mohamud dahir </td><td>61</td><td>Topclass</td><td>mahamud dahir abdishakur</td><td>615586095</td><td>New Student</td><td>N/A</td></tr><tr><td>199</td><td>369</td><td>Rimas yasir isse haji </td><td>61</td><td>Topclass</td><td>yasir isse haji </td><td>615559629</td><td>New Student</td><td>N/A</td></tr><tr><td>200</td><td>370</td><td>Raid yasir isse haji</td><td>61</td><td>Baby class</td><td>yasir isse haji </td><td>615559629</td><td>New Student</td><td>N/A</td></tr><tr><td>201</td><td>371</td><td>abuukar abdinur osman abdi</td><td>61</td><td>Baby class</td><td>yasmin ali ibrahim</td><td>615207985, 617863351</td><td>New Student</td><td>N/A</td></tr><tr><td>202</td><td>372</td><td>samir muse mohamud hashi</td><td>61</td><td>Topclass</td><td>muse mohamed xaashi</td><td>617478708</td><td>New Student</td><td>N/A</td></tr><tr><td>203</td><td>374</td><td>yasliin hadi ali mohamed</td><td>61</td><td>Class 4</td><td>abdirisaq daud abdullahi </td><td>610136419</td><td>New Student</td><td>N/A</td></tr><tr><td>204</td><td>375</td><td>yasir hadi ali mohamed</td><td>61</td><td>Class 5</td><td>abdirisaq daud abdullahi </td><td>610136419</td><td>New Student</td><td>N/A</td></tr><tr><td>205</td><td>376</td><td>Mascud Barre Jimcale</td><td>613648175</td><td>Class 3</td><td>Barre Jimcale</td><td>61</td><td>New Student</td><td>N/A</td></tr><tr><td>206</td><td>377</td><td>hidayo hussein abdi mahamed</td><td>61</td><td>Topclass</td><td>Fahmo ali kassim </td><td>616745594</td><td>New Student</td><td>N/A</td></tr><tr><td>207</td><td>380</td><td>mustaqin dahir hassan mohamud </td><td>61</td><td>Topclass</td><td>khadija hassan said </td><td>612020096</td><td>New Student</td><td>N/A</td></tr><tr><td>208</td><td>381</td><td>bahjo abdirahman abdulqadir </td><td>61</td><td>Class 3</td><td></td><td>61</td><td>New Student</td><td>N/A</td></tr><tr><td>209</td><td>382</td><td>hibaaq mohamed abdulhalim</td><td>61</td><td>Baby class</td><td>mohamed abdihalim</td><td>616140777</td><td>New Student</td><td>N/A</td></tr><tr><td>210</td><td>383</td><td>ahmed nuur ibrahim </td><td>61</td><td>Form 1</td><td>nuur ibrahim</td><td>617955055</td><td>New Student</td><td>N/A</td></tr><tr><td>211</td><td>384</td><td>abdifatah yunis hassan </td><td>61</td><td>Form 1</td><td>yunis hasan </td><td>615584054</td><td>New Student</td><td>N/A</td></tr><tr><td>212</td><td>386</td><td>maysuuun ibrahim</td><td>61</td><td>Topclass</td><td>maryan mohamed</td><td>619691271</td><td>New Student</td><td>N/A</td></tr><tr><td>213</td><td>387</td><td>zakia habeeb xussein </td><td>61</td><td>Class 4</td><td>maymun khalid </td><td>615070436</td><td>New Student</td><td>N/A</td></tr><tr><td>214</td><td>388</td><td>maxamed xabeb  xuseen </td><td>61</td><td>Class 4</td><td>maymun khalid </td><td>615070436</td><td>New Student</td><td>N/A</td></tr><tr><td>215</td><td>390</td><td>adam abdikani abdullahi </td><td>61</td><td>Baby class</td><td>abdikani abdullahi </td><td>615198680</td><td>New Student</td><td>N/A</td></tr><tr><td>216</td><td>391</td><td>nadia osman ahmed </td><td>61</td><td>Class 1</td><td>OSMAN AHMED MOHAMED</td><td>615965013</td><td>New Student</td><td>N/A</td></tr><tr><td>217</td><td>392</td><td>liana abdinasir muse </td><td>61</td><td>Baby class</td><td>Abdinasir Musse</td><td>619872250</td><td>New Student</td><td>N/A</td></tr><tr><td>218</td><td>393</td><td>abukar sidow osman </td><td>61</td><td>Baby class</td><td>Muna sidow osman</td><td>615571378</td><td>New Student</td><td>N/A</td></tr><tr><td>219</td><td>394</td><td>iqlaas yusuf ali</td><td>61</td><td>Form 2</td><td>suado ali </td><td>615521469</td><td>New Student</td><td>N/A</td></tr><tr><td>220</td><td>396</td><td>siham ibrahim muhudin </td><td>61</td><td>Class 4</td><td>Abdinaser Hassan</td><td>619872250</td><td>New Student</td><td>N/A</td></tr><tr><td>221</td><td>397</td><td>sumayo ibrahim muhudin</td><td>61</td><td>Class 4</td><td>Abdinasir Musse</td><td>619872250</td><td>New Student</td><td>N/A</td></tr><tr><td>222</td><td>398</td><td>aisho farah nuur </td><td>61</td><td>Class 5</td><td>khadija mohamed</td><td>617086339</td><td>New Student</td><td>N/A</td></tr><tr><td>223</td><td>399</td><td>zahur farah noor </td><td>61</td><td>Class 3</td><td>khadija mohamed</td><td>617086339</td><td>New Student</td><td>N/A</td></tr><tr><td>224</td><td>400</td><td>mohamed ahmed mohamed</td><td>61</td><td>Topclass</td><td>muno abdikani </td><td>615802616</td><td>New Student</td><td>N/A</td></tr><tr><td>225</td><td>401</td><td>osman yusuf osman </td><td>61</td><td>Class 3</td><td>khadija muxudin</td><td>615031174</td><td>New Student</td><td>N/A</td></tr><tr><td>226</td><td>402</td><td>maxamed yusuf osman </td><td>61</td><td>Class 4</td><td>khadija muxudin</td><td>615031174</td><td>New Student</td><td>N/A</td></tr><tr><td>227</td><td>403</td><td>khalid ali sharif nuur </td><td>61</td><td>Class 4</td><td>khadija muxudin</td><td>615031174</td><td>New Student</td><td>N/A</td></tr><tr><td>228</td><td>404</td><td>anhaar hussein abdullahi </td><td>61</td><td>Baby class</td><td>khadija muxudin</td><td>615031174</td><td>New Student</td><td>N/A</td></tr><tr><td>229</td><td>405</td><td>maido mohamed abukar</td><td>61</td><td>Class 5</td><td>fartun hasan</td><td>615808999</td><td>New Student</td><td>N/A</td></tr><tr><td>230</td><td>406</td><td>sacad mohamed ibrahim </td><td>61</td><td>Baby class</td><td>fartun hasan</td><td>615808999</td><td>New Student</td><td>N/A</td></tr><tr><td>231</td><td>407</td><td>sufyaan said abdulkadir </td><td>61</td><td>Form 1</td><td>ikraan dahir farah </td><td>615531693</td><td>New Student</td><td>N/A</td></tr><tr><td>232</td><td>408</td><td>zuheyb said abdulkadir </td><td>61</td><td>Form 1</td><td>ikraan dahir farah </td><td>615531693</td><td>New Student</td><td>N/A</td></tr><tr><td>233</td><td>409</td><td>simraan said abdulkadir </td><td>61</td><td>Class 2</td><td>ikraan dahir farah </td><td>615531693</td><td>New Student</td><td>N/A</td></tr><tr><td>234</td><td>410</td><td>moahamed said abdulkadir </td><td>61</td><td>Class 1</td><td>ikraan dahir farah </td><td>615531693</td><td>New Student</td><td>N/A</td></tr><tr><td>235</td><td>411</td><td>sahro said abdulkadir dahir</td><td>61</td><td>Class 2</td><td></td><td>61</td><td>New Student</td><td>N/A</td></tr><tr><td>236</td><td>412</td><td>sabriin said abdulkadir </td><td>61</td><td>Baby class</td><td>ikraan dahir farah </td><td>615531693</td><td>New Student</td><td>N/A</td></tr><tr><td>237</td><td>413</td><td>salma said abdulkadir dahir </td><td>61</td><td>Class 5</td><td>ikraan dahir farah </td><td>615531693</td><td>New Student</td><td>N/A</td></tr><tr><td>238</td><td>414</td><td>sumayo said abdulkadir </td><td>61</td><td>Class 5</td><td>ikraan dahir farah </td><td>615531693</td><td>New Student</td><td>N/A</td></tr><tr><td>239</td><td>415</td><td>farhiya mohamed jimcale</td><td>61</td><td>Class 6</td><td>falasatin mohamed</td><td>615327836</td><td>New Student</td><td>N/A</td></tr><tr><td>240</td><td>416</td><td>ayub abduqadir sh ahmed</td><td>61</td><td>Baby class</td><td>amal sharif </td><td>618043344</td><td>New Student</td><td>N/A</td></tr><tr><td>241</td><td>417</td><td>muhiim tahlil omar </td><td>61</td><td>Class 6</td><td>siham hasan ali</td><td>615358184</td><td>New Student</td><td>N/A</td></tr><tr><td>242</td><td>418</td><td>mohamed abdiwali mohamed </td><td>61</td><td>Class 3</td><td>fadumo abdirahman</td><td>615104348</td><td>New Student</td><td>N/A</td></tr><tr><td>243</td><td>419</td><td>maxamed abdiqani abdullahi</td><td>61</td><td>Topclass</td><td>yurub xasan </td><td>615221952</td><td>New Student</td><td>N/A</td></tr><tr><td>244</td><td>421</td><td>maazim liiban yusuf</td><td>61</td><td>Baby class</td><td>ibtisaan magan</td><td>615917298</td><td>Transfer Student</td><td>al ahaar</td></tr><tr><td>245</td><td>422</td><td>atika mohamed abukar</td><td>61</td><td>Class 3</td><td>mohamed abukar</td><td>612916184</td><td>New Student</td><td>N/A</td></tr><tr><td>246</td><td>423</td><td>ismail mohamed abukar </td><td>61</td><td>Topclass</td><td>mohamed abukar</td><td>612916184</td><td>New Student</td><td>N/A</td></tr><tr><td>247</td><td>424</td><td>HASSAN SAID HAJI</td><td>61</td><td>Class 8</td><td>deeqo hassan </td><td>617700601</td><td>New Student</td><td>N/A</td></tr><tr><td>248</td><td>425</td><td>abdirahman iman ali </td><td>61</td><td>Form 4</td><td>ugbad iman ali</td><td>612497540</td><td>New Student</td><td>N/A</td></tr><tr><td>249</td><td>426</td><td>faiza shell kasim</td><td>61</td><td>Form 4</td><td>kowsar cumar </td><td>618167475</td><td>New Student</td><td>N/A</td></tr><tr><td>250</td><td>427</td><td>sahra said abdulkadir </td><td>61</td><td>Baby class</td><td>ikraan dahir farah </td><td>615531693</td><td>New Student</td><td>N/A</td></tr><tr><td>251</td><td>428</td><td>sundus said abdulkadir </td><td>61</td><td>Class 3</td><td>ikraan dahir farah </td><td>615531693</td><td>New Student</td><td>N/A</td></tr><tr><td>252</td><td>429</td><td>nadwa ise ali mohamud</td><td>61</td><td>Baby class</td><td>sacdiyo aweys </td><td>615329222</td><td>New Student</td><td>N/A</td></tr><tr><td>253</td><td>430</td><td>ahmed abdiqadir dahir ahmed</td><td>61</td><td>Baby class</td><td>Abdiqadir dahir ahmed</td><td>615846491</td><td>New Student</td><td>N/A</td></tr><tr><td>254</td><td>431</td><td>abdirahman omar hassan </td><td>61</td><td>Baby class</td><td>sabarin abdiaziz</td><td>616411711</td><td>New Student</td><td>N/A</td></tr>`;

// Female name dictionary for Somali names
const FEMALE_NAMES = new Set([
    'amina', 'hodan', 'ubah', 'fartun', 'naima', 'sahra', 'khadra', 'ilham', 'ayaan', 'ayan', 'zamzam', 'muna',
    'hani', 'deqa', 'deeqo', 'asli', 'ifrah', 'nasteha', 'nasteexo', 'riham', 'amira', 'amiira', 'suleqa', 'luul',
    'ahlam', 'rahima', 'roda', 'miski', 'afnan', 'afnaan', 'mariya', 'nado', 'wajna', 'manaal', 'ummulkhair',
    'badriya', 'sagal', 'zeytun', 'najwa', 'siham', 'sihaam', 'aisha', 'yusra', 'hamdi', 'hibo', 'sumayo', 'sumaya',
    'khadija', 'iqbaal', 'iqlas', 'iqlaas', 'sabarin', 'sabriin', 'hidayo', 'almas', 'mushtaq', 'suhayla', 'sitey',
    'fatima', 'sucaado', 'fardowsa', 'suweyda', 'susan', 'amal', 'nadar', 'maryan', 'ilhan', 'seynab', 'nadra',
    'aminakiin', 'balqiisa', 'salima', 'nura', 'ilwaad', 'hafsa', 'anfac', 'ayni', 'layan', 'salma', 'mahado',
    'asma', 'rimas', 'yasliin', 'bahjo', 'hibaaq', 'maysuuun', 'zakia', 'liana', 'aisho', 'zahur', 'anhaar',
    'maido', 'simraan', 'sahro', 'sundus', 'farhiya', 'farhiyo', 'muhiim', 'atika', 'faiza', 'nadwa', 'qadra',
    'kowsar', 'dahabo', 'fahmo', 'sacdiyo', 'falasatin', 'yurub', 'ibtisaan', 'hajiro', 'bishaaro', 'ramlo',
    'safiyo', 'shukri', 'samira', 'umulkhair', 'maymun', 'ikraan'
]);

const cleanText = (str) => String(str || '').replace(/\s+/g, ' ').trim();
const toTitleCase = (str) => cleanText(str).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const detectGender = (firstName) => {
    const cleanFirst = cleanText(firstName).toLowerCase();
    return FEMALE_NAMES.has(cleanFirst) ? 'Female' : 'Male';
};

const getDobForClass = (className) => {
    const c = cleanText(className).toLowerCase();
    if (c.includes('baby')) return '2022-01-15';
    if (c.includes('top')) return '2021-01-15';
    if (c === 'class 1') return '2020-01-15';
    if (c === 'class 2') return '2019-01-15';
    if (c === 'class 3') return '2018-01-15';
    if (c === 'class 4') return '2017-01-15';
    if (c === 'class 5') return '2016-01-15';
    if (c === 'class 6') return '2015-01-15';
    if (c === 'class 7') return '2014-01-15';
    if (c === 'class 8') return '2013-01-15';
    if (c === 'form 1') return '2012-01-15';
    if (c === 'form 2') return '2011-01-15';
    if (c === 'form 3') return '2010-01-15';
    if (c === 'form 4') return '2009-01-15';
    return '2018-01-15';
};

const normalizePhone = (str) => {
    const digits = String(str || '').replace(/[^\d]/g, '');
    if (!digits || digits.length < 7) return '';
    if (digits.startsWith('252')) return `+${digits}`;
    if (digits.startsWith('0')) return `+252${digits.slice(1)}`;
    if (digits.startsWith('61') || digits.startsWith('62') || digits.startsWith('77')) return `+252${digits}`;
    return `+252${digits}`;
};

const parseStudents = () => {
    const rows = [];
    const trRegex = /<tr>([\s\S]*?)<\/tr>/gi;
    let match;
    while ((match = trRegex.exec(RAW_HTML)) !== null) {
        const tr = match[1];
        const tdRegex = /<td>([\s\S]*?)<\/td>/gi;
        const cells = [];
        let tdMatch;
        while ((tdMatch = tdRegex.exec(tr)) !== null) {
            cells.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
        }
        if (cells.length >= 7) {
            const [no, id, rawStudent, rawPhone, rawClass, rawResp, rawRespPhone, rawType, rawTrans] = cells;
            if (no === 'No.' || !rawStudent) continue;

            const fullName = toTitleCase(rawStudent);
            const nameParts = fullName.split(' ').filter(Boolean);
            let firstName = '';
            let middleName = '';
            let lastName = '';

            if (nameParts.length >= 4) {
                firstName = nameParts[0];
                middleName = nameParts[1];
                lastName = nameParts.slice(2).join(' ');
            } else if (nameParts.length === 3) {
                firstName = nameParts[0];
                middleName = nameParts[1];
                lastName = nameParts[2];
            } else if (nameParts.length === 2) {
                firstName = nameParts[0];
                middleName = '';
                lastName = nameParts[1];
            } else if (nameParts.length === 1) {
                firstName = nameParts[0];
                middleName = '';
                lastName = '-';
            }

            const cleanClass = cleanText(rawClass).replace(/\s+/g, ' ');
            const standardClassName = cleanClass.toLowerCase().includes('baby') ? 'Baby Class'
                : cleanClass.toLowerCase().includes('top') ? 'Top Class'
                : toTitleCase(cleanClass);

            const gender = detectGender(firstName);
            const dateOfBirth = getDobForClass(standardClassName);
            const cleanGuardian = toTitleCase(rawResp || 'Guardian');
            const cleanGuardianPhone = normalizePhone(rawRespPhone) || '+252610000000';
            const cleanStudentPhone = normalizePhone(rawPhone);
            const prevSchool = rawTrans && rawTrans !== 'N/A' ? toTitleCase(rawTrans) : '';

            // Generate clean guardian email to share parent accounts across siblings
            const guardianKey = cleanGuardianPhone.replace(/[^\d]/g, '').slice(-9) || cleanGuardian.toLowerCase().replace(/[^a-z0-9]/g, '');
            const guardianEmail = `parent.${guardianKey}@nuur-al-ilm.school`;

            rows.push({
                no: Number(no),
                oldId: id,
                firstName,
                middleName,
                lastName,
                fullName,
                preferredName: '',
                dateOfBirth,
                gender,
                className: standardClassName,
                sectionName: 'A',
                admissionDate: '2026-09-01',
                nationality: 'Somali',
                placeOfBirth: 'Mogadishu',
                primaryLanguage: 'Somali',
                previousSchool: prevSchool,
                guardianName: cleanGuardian,
                guardianPhone: cleanGuardianPhone,
                guardianEmail,
                guardianRelationship: 'Parent',
                guardianAddress: 'Mogadishu, Somalia',
                emergencyContactName: cleanGuardian,
                emergencyContactPhone: cleanGuardianPhone,
                studentPhone: cleanStudentPhone,
                medicalNotes: '',
                learningSupportDetails: '',
                notes: `Old School ID: ${id}${rawType ? ' | Type: ' + rawType : ''}`
            });
        }
    }
    return rows;
};

const run = async () => {
    console.log('=== Starting Real School Database Configuration & Student Import ===\n');
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected to database: ${mongoose.connection.name}`);

    const tenant = await Tenant.findOne().sort({ createdAt: 1 });
    if (!tenant) throw new Error('No tenant found! Bootstrap platform first.');
    const branch = await Branch.findOne({ tenantId: tenant._id }).sort({ createdAt: 1 });
    if (!branch) throw new Error('No branch found for tenant!');
    const academicYear = await AcademicYear.findOne({ tenantId: tenant._id, isCurrent: true })
        || await AcademicYear.findOne({ tenantId: tenant._id }).sort({ createdAt: -1 });
    if (!academicYear) throw new Error('No academic year found!');

    console.log(`\n🏫 Institution: ${tenant.name} (${tenant.domain})`);
    console.log(`📍 Branch: ${branch.name}`);
    console.log(`📅 Academic Year: ${academicYear.name}`);

    // 1. Update Tenant studentIdConfig
    tenant.studentIdConfig = {
        prefix: 'KS',
        includeYear: true,
        separator: '-',
        padding: 3
    };
    await tenant.save();
    console.log(`✅ Configured Student ID Format: Prefix: KS, Year: 2026, Padding: 3 -> Preview: KS-2026-001`);

    // 2. Clear old student records to prevent mixing
    console.log('\n🧹 Clearing old student data...');
    await Student.deleteMany({ tenantId: tenant._id });
    await Enrollment.deleteMany({ tenantId: tenant._id });
    await ParentStudentLink.deleteMany({ tenantId: tenant._id });
    await AttendanceRecord.deleteMany({ tenantId: tenant._id });
    await AttendanceSession.deleteMany({ tenantId: tenant._id });
    await Result.deleteMany({ tenantId: tenant._id });
    await Invoice.deleteMany({ tenantId: tenant._id });
    await Payment.deleteMany({ tenantId: tenant._id });
    await User.deleteMany({ tenantId: tenant._id, role: { $in: ['student', 'parent'] } });
    await Counter.deleteMany({ tenantId: tenant._id, key: { $regex: /^studentCode/ } });
    console.log('✅ Cleared all previous students, enrollments, portal accounts, and ID counters.');

    // 3. Create the 14 Academic Categories, Classes, and Section A
    console.log('\n📚 Setting up the 14 Academic Classes...');
    const CATEGORIES_CONFIG = [
        { name: 'Early Childhood', description: 'Kindergarten & Pre-School', classes: ['Baby Class', 'Top Class'] },
        { name: 'Primary School', description: 'Grades 1 to 6', classes: ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6'] },
        { name: 'Middle School', description: 'Grades 7 and 8', classes: ['Class 7', 'Class 8'] },
        { name: 'Secondary School', description: 'Form 1 to Form 4 (Grades 9 to 12)', classes: ['Form 1', 'Form 2', 'Form 3', 'Form 4'] }
    ];

    const classMap = new Map(); // className -> Class Doc
    const sectionMap = new Map(); // classId -> Section A Doc

    for (const catConfig of CATEGORIES_CONFIG) {
        let cat = await ClassCategory.findOne({ tenantId: tenant._id, branchId: branch._id, name: catConfig.name });
        if (!cat) {
            cat = await ClassCategory.create({
                tenantId: tenant._id,
                branchId: branch._id,
                name: catConfig.name,
                description: catConfig.description
            });
        }

        for (let i = 0; i < catConfig.classes.length; i++) {
            const clsName = catConfig.classes[i];
            let gradeLevel = 0;
            const numMatch = clsName.match(/\d+/);
            if (numMatch) {
                const n = parseInt(numMatch[0], 10);
                gradeLevel = clsName.startsWith('Form') ? n + 8 : n;
            }

            let cls = await Class.findOne({ tenantId: tenant._id, branchId: branch._id, name: clsName });
            if (!cls) {
                cls = await Class.create({
                    tenantId: tenant._id,
                    branchId: branch._id,
                    categoryId: cat._id,
                    name: clsName,
                    gradeLevel
                });
            }
            classMap.set(clsName, cls);

            // Ensure Section A exists
            let sec = await Section.findOne({ tenantId: tenant._id, branchId: branch._id, classId: cls._id, name: 'A' });
            if (!sec) {
                sec = await Section.create({
                    tenantId: tenant._id,
                    branchId: branch._id,
                    classId: cls._id,
                    name: 'A',
                    capacity: 50,
                    isActive: true
                });
            }
            sectionMap.set(String(cls._id), sec);
        }
    }
    console.log(`✅ Verified ${classMap.size} Academic Classes with Section A in place.`);

    // 4. Parse students and build clean dataset
    const students = parseStudents();
    console.log(`\n📋 Parsed ${students.length} students from source data.`);

    // 5. Generate Excel & CSV exports for user
    const excelHeaders = [
        'No.', 'Student ID', 'First Name', 'Middle Name', 'Last Name', 'Full Name',
        'Gender', 'Date of Birth', 'Class', 'Section', 'Admission Date', 'Nationality',
        'Place of Birth', 'Primary Language', 'Previous School', 'Guardian Name',
        'Guardian Phone', 'Guardian Email', 'Guardian Relationship', 'Guardian Address',
        'Student Phone', 'Notes'
    ];

    const excelRows = [];
    const csvRows = [excelHeaders.map(h => `"${h}"`).join(',')];

    for (let index = 0; index < students.length; index++) {
        const item = students[index];
        const studentCode = formatStudentCode('KS', academicYear.name, index + 1, { includeYear: true, separator: '-', padding: 3 });
        item.generatedStudentCode = studentCode;

        const rowValues = [
            item.no,
            studentCode,
            item.firstName,
            item.middleName,
            item.lastName,
            item.fullName,
            item.gender,
            item.dateOfBirth,
            item.className,
            item.sectionName,
            item.admissionDate,
            item.nationality,
            item.placeOfBirth,
            item.primaryLanguage,
            item.previousSchool,
            item.guardianName,
            item.guardianPhone,
            item.guardianEmail,
            item.guardianRelationship,
            item.guardianAddress,
            item.studentPhone,
            item.notes
        ];

        excelRows.push(rowValues);
        csvRows.push(rowValues.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
    }

    const { buildWorkbook, STYLE } = require('../utils/xlsxWriter');

    const headerCells = excelHeaders.map(h => ({ v: h, style: 'header' }));
    const dataRowCells = excelRows.map(row => row.map(cell => ({ v: cell !== undefined && cell !== null ? cell : '', style: typeof cell === 'number' ? 'integer' : 'text' })));

    const xlsxBuffer = buildWorkbook([{
        name: '254 Students',
        freezeRows: 1,
        columns: excelHeaders.map(() => ({ width: 18 })),
        rows: [headerCells, ...dataRowCells]
    }]);

    const rootDir = path.resolve(__dirname, '..', '..');
    const xlsxPath = path.join(rootDir, '254_Students_Clean_Directory.xlsx');
    const csvPath = path.join(rootDir, '254_Students_Clean_Directory.csv');

    fs.writeFileSync(xlsxPath, xlsxBuffer);
    fs.writeFileSync(csvPath, csvRows.join('\n'));
    console.log(`✅ Saved clean Excel export to: ${xlsxPath}`);
    console.log(`✅ Saved clean CSV export to: ${csvPath}`);

    // 6. Import all 254 students into database
    console.log('\n📥 Inserting 254 students into the school database...');
    let admittedCount = 0;
    const parentMap = new Map(); // guardianEmail -> User Doc

    for (let index = 0; index < students.length; index++) {
        const item = students[index];
        const targetClass = classMap.get(item.className);
        if (!targetClass) {
            console.error(`Class not found: ${item.className} for student ${item.fullName}`);
            continue;
        }
        const targetSection = sectionMap.get(String(targetClass._id));

        const student = await Student.create({
            tenantId: tenant._id,
            branchId: branch._id,
            admissionNumber: item.generatedStudentCode,
            studentCode: item.generatedStudentCode,
            firstName: item.firstName,
            middleName: item.middleName || undefined,
            lastName: item.lastName,
            preferredName: item.firstName,
            DOB: item.dateOfBirth,
            gender: item.gender,
            nationality: item.nationality,
            placeOfBirth: item.placeOfBirth,
            primaryLanguage: item.primaryLanguage,
            previousSchool: item.previousSchool || undefined,
            admissionDate: item.admissionDate,
            guardianInfo: {
                name: item.guardianName,
                phone: item.guardianPhone,
                email: item.guardianEmail,
                relationship: item.guardianRelationship,
                address: item.guardianAddress
            },
            emergencyContact: {
                name: item.emergencyContactName,
                phone: item.emergencyContactPhone,
                relationship: 'Parent / Guardian'
            },
            status: 'Active',
            notes: item.notes
        });

        // Create Enrollment
        await Enrollment.create({
            tenantId: tenant._id,
            branchId: branch._id,
            studentId: student._id,
            academicYearId: academicYear._id,
            classId: targetClass._id,
            sectionId: targetSection?._id,
            status: 'Current',
            enrollmentDate: new Date('2026-09-01'),
            isCurrent: true
        });

        // Set up / link Parent Account
        let parentUser = parentMap.get(item.guardianEmail);
        if (!parentUser) {
            parentUser = await User.findOne({ tenantId: tenant._id, email: item.guardianEmail });
            if (!parentUser) {
                parentUser = await User.create({
                    tenantId: tenant._id,
                    branchId: branch._id,
                    name: item.guardianName,
                    email: item.guardianEmail,
                    phone: item.guardianPhone,
                    passwordHash: 'Demo#Passw0rd',
                    role: 'parent',
                    scope: 'tenant',
                    isActive: true,
                    mustChangePassword: false,
                    students: [student._id]
                });
            } else {
                if (!parentUser.students.some(sId => String(sId) === String(student._id))) {
                    parentUser.students.push(student._id);
                    await parentUser.save();
                }
            }
            parentMap.set(item.guardianEmail, parentUser);
        } else {
            if (!parentUser.students.some(sId => String(sId) === String(student._id))) {
                parentUser.students.push(student._id);
                await parentUser.save();
            }
        }

        await ParentStudentLink.create({
            tenantId: tenant._id,
            parentUserId: parentUser._id,
            studentId: student._id,
            relationship: item.guardianRelationship,
            isPrimaryContact: true,
            isBillingContact: true,
            hasPortalAccess: true
        });

        admittedCount++;
    }

    // Set counter sequence
    await Counter.findOneAndUpdate(
        { tenantId: tenant._id, branchId: branch._id, key: 'studentCode_2026' },
        { seq: admittedCount },
        { upsert: true }
    );

    console.log(`\n🎉 Successfully imported ${admittedCount} students!`);
    console.log(`   ID Range: ${students[0].generatedStudentCode} to ${students[students.length - 1].generatedStudentCode}`);
    console.log(`   Parent Accounts Linked: ${parentMap.size}`);

    await mongoose.disconnect();
    console.log('\n=== Database update complete ===');
};

run().catch((err) => {
    console.error('Execution failed:', err);
    process.exit(1);
});
